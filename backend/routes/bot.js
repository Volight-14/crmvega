const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Функция для экранирования специальных символов MarkdownV2
// Telegram требует экранирования: _ * [ ] ( ) ~ ` > # + - = | { } . !
function escapeMarkdownV2(text) {
  if (!text) return text;

  // Символы, которые нужно экранировать в MarkdownV2
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];

  let escaped = text;
  specialChars.forEach(char => {
    escaped = escaped.replace(new RegExp('\\' + char, 'g'), '\\' + char);
  });

  return escaped;
}

// Функция для отправки сообщения пользователю через Telegram Bot API
async function sendMessageToUser(telegramUserId, message, options = {}) {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN не установлен');
      return false;
    }

    const axios = require('axios');

    // Формируем тело запроса с поддержкой Markdown
    const requestBody = {
      chat_id: telegramUserId,
      text: message,
      parse_mode: 'MarkdownV2', // Поддержка Markdown форматирования
      ...options // Дополнительные опции (reply_to_message_id и т.д.)
    };

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, requestBody);

    return true;
  } catch (error) {
    console.error('Error sending message via bot:', error.response?.data || error.message);

    // Если ошибка связана с parse_mode, пробуем отправить без форматирования
    if (error.response?.data?.description?.includes('parse')) {
      try {
        const axios = require('axios');
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: telegramUserId,
          text: message
        });
        console.log('[sendMessageToUser] Sent without formatting due to parse error');
        return true;
      } catch (retryError) {
        console.error('Error sending message without formatting:', retryError.message);
        return false;
      }
    }

    return false;
  }
}

// REMOVED: /send-message endpoint - used non-existent 'chats' table
// Use /api/order-messages/:orderId/client instead

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

    // Обновляем last_message_at у контакта
    if (contactId) {
      await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', contactId);
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
          type: 'inquiry',
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
        // Prepare payload with order status for filtering
        const socketPayload = {
          ...savedMessage,
          order_status: currentOrder ? currentOrder.status : 'unsorted'
        };

        io.to(`order_${currentOrder.id}`).emit('new_client_message', savedMessage);
        // Legacy room support
        io.to(`lead_${linkId}`).emit('new_message', savedMessage);
        // Global emit for Inbox - WITH STATUS
        io.emit('new_message_global', socketPayload);
        // Emit for specific contact
        io.emit('contact_message', { contact_id: contactId, message: savedMessage });
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
      console.log(`[bot.js] Received message with text/caption: "${messageText}"`); // Debug log
      let messageType = 'text';
      let attachmentUrl = null;
      let replyToMessageId = null;

      // Handle Replies
      if (update.message.reply_to_message) {
        replyToMessageId = update.message.reply_to_message.message_id;
        console.log(`[bot.js] Received reply to message ID: ${replyToMessageId}, Original Msg Type: ${update.message.reply_to_message.document ? 'document' : 'text'}`);
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
        if (!messageText && update.message.caption) messageText = update.message.caption; // Fallback capture
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
        if (!messageText && update.message.caption) messageText = update.message.caption; // Fallback capture
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
        if (!messageText && update.message.caption) messageText = update.message.caption; // Fallback capture
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
        if (!messageText && update.message.caption) messageText = update.message.caption; // Fallback capture
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

    // Обработка callback_query (нажатие на инлайн-кнопки)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const telegramUserId = callbackQuery.from.id;
      const messageText = callbackQuery.data;
      const telegramUserInfo = callbackQuery.from;

      console.log(`[bot.js] Received callback_query: "${messageText}" from user ${telegramUserId}`);

      // 1. Сразу отвечаем Telegram, чтобы убрать часики (UX)
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      if (TELEGRAM_BOT_TOKEN) {
        // Не ждем завершения (fire and forget), но логируем ошибку
        const axios = require('axios');
        axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id
        }).catch(err => console.error('[bot.js] Error answering callback:', err.message));

        // NEW: Echo button text back to chat
        axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: telegramUserId,
          text: messageText
        }).catch(err => console.error('[bot.js] Error echoing callback:', err.message));
      }

      // 2. Отправляем сообщение в CRM
      try {
        const leadId = await sendMessageToCRM(telegramUserId, messageText, telegramUserInfo, req);
        console.log(`[bot.js] Callback processed. Result LeadID: ${leadId}`);
        if (!leadId) {
          console.error('[bot.js] sendMessageToCRM returned null leadId for callback');
        }
      } catch (err) {
        console.error('[bot.js] Error processing callback message to CRM:', err);
      }
    }

    // Обработка реакций на сообщения
    if (update.message_reaction) {
      const reaction = update.message_reaction;
      const tgMessageId = reaction.message_id;
      const newReactions = reaction.new_reaction; // Array of reaction objects e.g. [{ type: 'emoji', emoji: '👍' }]

      // Находим сообщение в базе по ID сообщения в Telegram
      const { data: messageData, error: findError } = await supabase
        .from('messages')
        .select('id, lead_id, content, reactions')
        .eq('message_id_tg', tgMessageId)
        .maybeSingle();

      if (messageData) {
        // Merge reactions to prevent overwriting Manager's reactions
        const currentReactions = messageData.reactions || [];
        const otherReactions = Array.isArray(currentReactions)
          ? currentReactions.filter(r => r.author && r.author !== 'Client' && r.author !== 'Клиент')
          : [];

        const clientReactions = newReactions.map(r => ({
          emoji: r.emoji,
          type: r.type,
          author: 'Client',
          created_at: new Date().toISOString()
        }));

        const mergedReactions = [...otherReactions, ...clientReactions];

        // Обновляем реакции в базе
        const { data: updatedMessage, error: updateError } = await supabase
          .from('messages')
          .update({ reactions: mergedReactions })
          .eq('id', messageData.id)
          .select()
          .single();

        if (!updateError) {
          console.log(`[bot.js] Updated reactions for message ${messageData.id}:`, mergedReactions);

          const io = req.app.get('io');
          if (io) {
            // Отправляем событие обновления сообщения
            io.emit('message_updated', updatedMessage);
            if (updatedMessage.lead_id) {
              io.to(`lead_${updatedMessage.lead_id}`).emit('message_updated', updatedMessage);
            }
          }
        } else {
          console.error('[bot.js] Error updating reactions:', updateError);
        }
      } else {
        console.warn(`[bot.js] Message not found for reaction update (TG ID: ${tgMessageId})`);
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

// Экспортируем вспомогательные функции
module.exports = router;
module.exports.escapeMarkdownV2 = escapeMarkdownV2;
