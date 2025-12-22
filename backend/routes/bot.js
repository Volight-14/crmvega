const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Функция для отправки сообщения пользователю через Telegram Bot API
async function sendMessageToUser(telegramUserId, message) {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN не установлен');
      return false;
    }

    const axios = require('axios');
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: telegramUserId,
      text: message
    });

    return true;
  } catch (error) {
    console.error('Error sending message via bot:', error.response?.data || error.message);
    return false;
  }
}

// Отправка сообщения пользователю через бота
router.post('/send-message', auth, async (req, res) => {
  try {
    const { lead_id, message } = req.body;

    // Получаем информацию о заявке (чате)
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('chat_id, client')
      .eq('lead_id', lead_id)
      .single();

    if (chatError || !chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    if (!chat.chat_id) {
      return res.status(400).json({ error: 'У чата нет Telegram ID пользователя' });
    }

    // Отправляем сообщение через бота
    const success = await sendMessageToUser(chat.chat_id, message);

    if (success) {
      // Сохраняем сообщение в базе
      const { data: savedMessage, error: messageError } = await supabase
        .from('messages')
        .insert({
          lead_id,
          content: message,
          sender_id: req.manager.id,
          sender_type: 'manager'
        })
        .select()
        .single();

      if (messageError) throw messageError;

      res.json(savedMessage);
    } else {
      res.status(500).json({ error: 'Не удалось отправить сообщение' });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(400).json({ error: error.message });
  }
});

// Функция для отправки сообщения в CRM
async function sendMessageToCRM(telegramUserId, content, telegramUserInfo = null, req = null, messageType = 'text', attachmentData = null, replyToMessageId = null, telegramMessageId = null) {
  try {
    // 1. Ищем или создаем контакт
    const { data: existingContact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('telegram_user_id', telegramUserId.toString())
      .maybeSingle();

    if (contactError && contactError.code !== 'PGRST116') {
      throw contactError;
    }

    let contactId;
    let contact;

    // Определяем лучшее имя из Telegram (Best Effort)
    const firstName = telegramUserInfo?.first_name || '';
    const lastName = telegramUserInfo?.last_name || '';
    const username = telegramUserInfo?.username ? `@${telegramUserInfo.username}` : '';

    let contactName = [firstName, lastName].filter(Boolean).join(' ');
    if (!contactName && username) contactName = username;
    if (!contactName) contactName = `Пользователь ${telegramUserId}`;

    if (!existingContact) {
      const { data: newContact, error: createContactError } = await supabase
        .from('contacts')
        .insert({
          name: contactName,
          phone: null,
          email: null,
          telegram_user_id: telegramUserId.toString(),
          status: 'active',
          comment: 'Автоматически создан из Telegram бота'
        })
        .select()
        .single();

      if (createContactError) throw createContactError;
      contactId = newContact.id;
      contact = newContact;
    } else {
      contactId = existingContact.id;
      contact = existingContact;

      // Проверяем, нужно ли обновить имя (если оно было generic "User ..." или "Пользователь ...")
      // и у нас есть более качественное имя
      const isGenericName = !contact.name ||
        contact.name.startsWith('User ') ||
        contact.name.startsWith('Пользователь ') ||
        contact.name === telegramUserId.toString();

      const validNewName = contactName && !contactName.startsWith('Пользователь ');

      if (isGenericName && validNewName) {
        console.log(`[bot.js] Updating contact name from "${contact.name}" to "${contactName}"`);
        const { data: updatedContact, error: updateError } = await supabase
          .from('contacts')
          .update({ name: contactName })
          .eq('id', contact.id)
          .select()
          .single();

        if (!updateError && updatedContact) {
          contact = updatedContact;
        }
      }
    }

    // 2. Ищем активную заявку (Order)
    const terminalStatuses = ['completed', 'scammer', 'client_rejected', 'lost'];
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('contact_id', contactId)
      .not('status', 'in', `(${terminalStatuses.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let currentOrder;

    if (activeOrder) {
      currentOrder = activeOrder;
      // Ensure main_id exists
      if (!currentOrder.main_id) {
        const newId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
        const { data: updatedOrder } = await supabase
          .from('orders')
          .update({ main_id: newId })
          .eq('id', currentOrder.id)
          .select()
          .single();
        currentOrder = updatedOrder || currentOrder;
        currentOrder.main_id = newId; // Fallback
      }
    } else {
      // Создаем новую заявку (Order)
      const newMainId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);

      const { data: newOrder, error: createOrderError } = await supabase
        .from('orders')
        .insert({
          contact_id: contactId,
          title: `Заявка от ${contact.name}`,
          amount: 0,
          currency: 'RUB',
          status: 'unsorted', // Используем 'unsorted' вместо 'new' если так принято, или 'new'
          source: 'telegram_bot',
          description: 'Автоматически созданная заявка из Telegram бота',
          created_at: new Date().toISOString(),
          main_id: newMainId
        })
        .select()
        .single();

      if (createOrderError) throw createOrderError;
      currentOrder = newOrder;

      // Запускаем автоматизации для новой заявки
      if (req && currentOrder) {
        const io = req.app.get('io');
        if (io) {
          io.emit('new_order', currentOrder);
        }
      }
    }

    // 3. Загружаем файл (если есть)
    let finalAttachmentUrl = null;
    if (attachmentData && attachmentData.buffer) {
      const ext = attachmentData.ext || 'bin';
      const fileName = `${Date.now()}_file.${ext}`;
      const filePath = `order_files/${currentOrder.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, attachmentData.buffer, {
          contentType: attachmentData.mimeType || 'audio/ogg',
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
      } else {
        const { data: urlData } = supabase.storage
          .from('attachments')
          .getPublicUrl(filePath);
        finalAttachmentUrl = urlData?.publicUrl;
      }
    }

    // 4. Создаем сообщение
    const linkId = currentOrder.main_id;

    const { data: savedMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: linkId,
        main_id: linkId,
        content: content,
        message_id_tg: telegramMessageId,
        reply_to_mess_id_tg: replyToMessageId, // Save reply ID
        author_type: 'user',
        message_type: messageType,
        file_url: finalAttachmentUrl,
        'Created Date': new Date().toISOString()
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Связываем через order_messages
    await supabase.from('order_messages').insert({
      order_id: currentOrder.id,
      message_id: savedMessage.id
    });

    // Отправляем Socket.IO событие о новом сообщении
    if (req) {
      const io = req.app.get('io');
      if (io && savedMessage) {
        io.to(`order_${currentOrder.id}`).emit('new_client_message', savedMessage);
        // Legacy room support
        io.to(`lead_${linkId}`).emit('new_message', savedMessage);
      }
    }

    return linkId;
  } catch (error) {
    console.error('Error sending message to CRM:', error);
    return null;
  }
}

// Webhook endpoint для Telegram бота
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;

    // Проверяем, что это сообщение
    if (update.message) {
      const telegramUserId = update.message.from.id;
      const messageId = update.message.message_id;

      let messageText = update.message.text || update.message.caption || '';
      let messageType = 'text';
      let attachmentUrl = null;
      let replyToMessageId = null;

      // Handle Replies
      if (update.message.reply_to_message) {
        replyToMessageId = update.message.reply_to_message.message_id;
      }

      // Helper to process file from Telegram
      const processTelegramFile = async (utils) => {
        const { fileId, type, mimeType, ext } = utils;
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const axios = require('axios');

        try {
          const fileInfoRes = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
          if (fileInfoRes.data.ok && fileInfoRes.data.result.file_path) {
            const filePath = fileInfoRes.data.result.file_path;
            console.log(`[processTelegramFile] Downloading ${type} from ${filePath}...`);

            // Extract extension from filePath if possible, fallback to provided ext
            const detectedExt = filePath.split('.').pop();
            const finalExt = detectedExt && detectedExt !== filePath ? detectedExt : ext;

            // Explicitly set mime type for common video formats to ensure playback
            const mimeMap = {
              'mp4': 'video/mp4',
              'mov': 'video/quicktime',
              'webm': 'video/webm'
            };
            const finalMimeType = (type === 'video' || type === 'video_note') && mimeMap[finalExt]
              ? mimeMap[finalExt]
              : mimeType;

            const fileRes = await axios.get(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`, {
              responseType: 'arraybuffer',
              maxContentLength: 50 * 1024 * 1024, // 50MB limit
              maxBodyLength: 50 * 1024 * 1024
            });

            console.log(`[processTelegramFile] Downloaded ${type}, size: ${fileRes.data.length} bytes, ext: ${finalExt}, mime: ${finalMimeType}`);
            const buffer = Buffer.from(fileRes.data);
            return { buffer, mimeType: finalMimeType, ext: finalExt };
          } else {
            console.error(`[processTelegramFile] Failed to get file path for ${type}:`, fileInfoRes.data);
            return null;
          }
        } catch (e) {
          console.error(`[processTelegramFile] Error processing ${type}:`, e.message, e.response?.data);
          return null;
        }
      };

      // 1. Голосовое сообщение
      if (update.message.voice) {
        messageType = 'voice';
        attachmentUrl = await processTelegramFile({
          fileId: update.message.voice.file_id,
          type: 'voice',
          mimeType: 'audio/ogg',
          ext: 'ogg'
        });
        if (!attachmentUrl) messageText = '[Ошибка загрузки голосового сообщения]';
      }
      // 2. Фото
      else if (update.message.photo) {
        messageType = 'image';
        // Берем самое большое фото (последний элемент массива)
        const photo = update.message.photo[update.message.photo.length - 1];
        attachmentUrl = await processTelegramFile({
          fileId: photo.file_id,
          type: 'photo',
          mimeType: 'image/jpeg',
          ext: 'jpg'
        });
        if (!attachmentUrl) messageText = '[Ошибка загрузки фото]';
      }
      // 3. Документ
      else if (update.message.document) {
        messageType = 'file';
        const doc = update.message.document;
        attachmentUrl = await processTelegramFile({
          fileId: doc.file_id,
          type: 'document',
          mimeType: doc.mime_type || 'application/octet-stream',
          ext: doc.file_name ? doc.file_name.split('.').pop() : 'bin'
        });
        if (!attachmentUrl) messageText = '[Ошибка загрузки файла]';
      }
      // 4. Стикер
      else if (update.message.sticker) {
        messageType = 'image'; // Treat as image for now, frontend handles webp
        // Telegram stickers are often .webp
        attachmentUrl = await processTelegramFile({
          fileId: update.message.sticker.file_id,
          type: 'sticker',
          mimeType: 'image/webp',
          ext: 'webp'
        });
        messageText = '[Стикер]'; // Add text if missing
      }
      // 5. Видео
      else if (update.message.video) {
        messageType = 'video';
        attachmentUrl = await processTelegramFile({
          fileId: update.message.video.file_id,
          type: 'video',
          mimeType: update.message.video.mime_type || 'video/mp4',
          ext: 'mp4'
        });
        if (!attachmentUrl) messageText = '[Ошибка загрузки видео]';
      }
      // 6. Видео-сообщение (кружочек)
      else if (update.message.video_note) {
        messageType = 'video_note';
        attachmentUrl = await processTelegramFile({
          fileId: update.message.video_note.file_id,
          type: 'video_note',
          mimeType: 'video/mp4',
          ext: 'mp4'
        });
        if (!attachmentUrl) messageText = '[Видеообращение]';
      }

      // Обрабатываем команды (только если есть текст)
      if (messageText && messageText.startsWith('/')) {
        if (messageText === '/start') {
          await sendMessageToUser(telegramUserId, 'Привет! Я бот поддержки CRM системы. Напишите ваше сообщение, и менеджер свяжется с вами.');
        }
        return res.status(200).end();
      }

      // Отправляем сообщение в CRM
      const telegramUserInfo = update.message.from;
      // Отправляем если есть текст ИЛИ если это не текст (т.е. вложение)
      if (messageText || messageType !== 'text') {
        const leadId = await sendMessageToCRM(telegramUserId, messageText, telegramUserInfo, req, messageType, attachmentUrl, replyToMessageId, messageId);

        if (leadId) {
          // await sendMessageToUser(telegramUserId, 'Ваше сообщение принято.');
        } else {
          await sendMessageToUser(telegramUserId, 'Произошла ошибка при отправке сообщения. Попробуйте позже.');
        }
      }
    }

    res.status(200).end();
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint для проверки статуса webhook
router.get('/webhook', (req, res) => {
  res.json({ status: 'ok', message: 'Telegram webhook endpoint' });
});

module.exports = router;
