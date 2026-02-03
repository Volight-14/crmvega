const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const auth = require('../middleware/auth');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

// Функция для экранирования специальных символов MarkdownV2
// Telegram требует экранирования: _ * [ ] ( ) ~ ` > # + - = | { } . !
function escapeMarkdownV2(text) {
  if (!text) return text;

  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escaped = text;
  specialChars.forEach(char => {
    escaped = escaped.replace(new RegExp('\\' + char, 'g'), '\\' + char);
  });

  return escaped;
}

// Генерация уникального ID для заявки
function generateMainId() {
  return parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
}

// Функция для отправки сообщения пользователю через Telegram Bot API
async function sendMessageToUser(telegramUserId, message, options = {}) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN не установлен');
    return false;
  }

  try {
    const requestBody = {
      chat_id: telegramUserId,
      text: message,
      // parse_mode больше не ставится по умолчанию как MarkdownV2, чтобы избежать ошибок с обычным текстом
      ...options
    };

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, requestBody);
    return true;
  } catch (error) {
    console.error('Error sending message via bot:', error.response?.data || error.message);

    // Если ошибка всё же случилась и мы пытались использовать форматирование
    if (options.parse_mode && error.response?.data?.description?.includes('parse')) {
      try {
        console.log('[sendMessageToUser] Retrying without formatting...');
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: telegramUserId,
          text: message
        });
        return true;
      } catch (retryError) {
        console.error('Error sending message without formatting:', retryError.message);
      }
    }
    return false;
  }
}

// Скачивание файла из Telegram
async function processTelegramFile({ fileId, type, mimeType, ext }) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
      return {
        buffer: Buffer.from(fileRes.data),
        mimeType: finalMimeType,
        ext: finalExt
      };
    } else {
      console.error(`[processTelegramFile] Failed to get file path for ${type}:`, fileInfoRes.data);
      return null;
    }
  } catch (e) {
    console.error(`[processTelegramFile] Error processing ${type}:`, e.message, e.response?.data);
    return null;
  }
}

// -----------------------------------------------------------------------------
// CRM Logic Decomposition
// -----------------------------------------------------------------------------

async function findOrCreateContact(telegramUserId, telegramUserInfo) {
  // 1. Ищем существующий контакт
  const { data: existingContact, error: contactError } = await supabase
    .from('contacts')
    .select('*')
    .eq('telegram_user_id', telegramUserId.toString())
    .maybeSingle();

  if (contactError && contactError.code !== 'PGRST116') {
    throw contactError;
  }

  // Определяем лучшее имя
  const firstName = telegramUserInfo?.first_name || '';
  const lastName = telegramUserInfo?.last_name || '';
  const username = telegramUserInfo?.username ? `@${telegramUserInfo.username}` : '';

  let contactName = [firstName, lastName].filter(Boolean).join(' ');
  if (!contactName && username) contactName = username;
  if (!contactName) contactName = `Пользователь ${telegramUserId}`;

  let contact;

  if (!existingContact) {
    // Создаем новый контакт
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
    contact = newContact;
  } else {
    contact = existingContact;

    // Проверяем возможность обновления имени
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

  // Обновляем last_message_at
  await supabase
    .from('contacts')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', contact.id);

  return contact;
}

async function findOrCreateOrder(contact, req) {
  const terminalStatuses = ['completed', 'scammer', 'client_rejected', 'lost'];

  // Ищем активную заявку
  const { data: activeOrder } = await supabase
    .from('orders')
    .select('*')
    .eq('contact_id', contact.id)
    .not('status', 'in', `(${terminalStatuses.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeOrder) {
    let currentOrder = activeOrder;
    // Если по какой-то причине нет main_id, добавляем его
    if (!currentOrder.main_id) {
      const newId = generateMainId();
      const { data: updatedOrder } = await supabase
        .from('orders')
        .update({ main_id: newId })
        .eq('id', currentOrder.id)
        .select()
        .single();
      if (updatedOrder) currentOrder = updatedOrder;
    }
    return { order: currentOrder, isNew: false };
  } else {
    // Создаем новую заявку
    const newMainId = generateMainId();
    const { data: newOrder, error: createOrderError } = await supabase
      .from('orders')
      .insert({
        contact_id: contact.id,
        title: `Заявка от ${contact.name}`,
        amount: 0,
        currency: 'RUB',
        status: 'unsorted',
        type: 'inquiry',
        source: 'telegram_bot',
        description: 'Автоматически созданная заявка из Telegram бота',
        created_at: new Date().toISOString(),
        main_id: newMainId
      })
      .select()
      .single();

    if (createOrderError) throw createOrderError;

    // Сообщаем о новой заявке через сокеты
    if (req) {
      const io = req.app.get('io');
      if (io) {
        io.emit('new_order', newOrder);
      }
    }

    return { order: newOrder, isNew: true };
  }
}

async function uploadAttachment(orderId, attachmentData) {
  if (!attachmentData || !attachmentData.buffer) return null;

  const fileName = `${Date.now()}_file.${attachmentData.ext || 'bin'}`;
  const filePath = `order_files/${orderId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(filePath, attachmentData.buffer, {
      contentType: attachmentData.mimeType || 'audio/ogg',
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('attachments')
    .getPublicUrl(filePath);

  return urlData?.publicUrl;
}

async function createMessage(order, content, telegramMessageId, replyToMessageId, messageType, fileUrl, req) {
  const linkId = order.main_id;

  const { data: savedMessage, error: messageError } = await supabase
    .from('messages')
    .insert({
      lead_id: linkId,
      main_id: linkId,
      content: content,
      message_id_tg: telegramMessageId,
      reply_to_mess_id_tg: replyToMessageId,
      author_type: 'user',
      message_type: messageType,
      file_url: fileUrl,
      'Created Date': new Date().toISOString()
    })
    .select()
    .single();

  if (messageError) throw messageError;

  // Связываем через order_messages
  await supabase.from('order_messages').insert({
    order_id: order.id,
    message_id: savedMessage.id
  });

  // Отправляем события через Socket.IO
  if (req) {
    const io = req.app.get('io');
    if (io && savedMessage) {
      const socketPayload = {
        ...savedMessage,
        order_status: order.status
      };

      io.to(`order_${order.id}`).emit('new_client_message', savedMessage);
      // Legacy room support
      io.to(`lead_${linkId}`).emit('new_message', savedMessage);
      // Global emit for Inbox
      io.emit('new_message_global', socketPayload);
      // Emit for specific contact
      io.emit('contact_message', { contact_id: order.contact_id, message: savedMessage });
    }
  }

  return linkId;
}

// Оркестратор отправки сообщения в CRM
async function sendMessageToCRM(telegramUserId, content, telegramUserInfo, req, messageType = 'text', attachmentData = null, replyToMessageId = null, telegramMessageId = null) {
  try {
    // 1. Ищем или создаем контакт
    const contact = await findOrCreateContact(telegramUserId, telegramUserInfo);

    // 2. Ищем или создаем сделку
    const { order } = await findOrCreateOrder(contact, req);

    // 3. Загружаем файл, если есть
    let finalAttachmentUrl = null;
    if (attachmentData) {
      finalAttachmentUrl = await uploadAttachment(order.id, attachmentData);
    }

    // 4. Создаем сообщение
    const resultId = await createMessage(order, content, telegramMessageId, replyToMessageId, messageType, finalAttachmentUrl, req);

    return resultId;

  } catch (error) {
    console.error('Error sending message to CRM:', error);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

// Webhook endpoint для Telegram бота
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;

    // --- Обработка входящего сообщения ---
    if (update.message) {
      const telegramUserId = update.message.from.id;
      const messageId = update.message.message_id;
      const telegramUserInfo = update.message.from;

      let messageText = update.message.text || update.message.caption || '';
      console.log(`[bot.js] Received message using refactored logic. Text/caption: "${messageText}"`);

      let messageType = 'text';
      let attachmentData = null;
      let replyToMessageId = null;

      if (update.message.reply_to_message) {
        replyToMessageId = update.message.reply_to_message.message_id;
      }

      // Определение типа контента и скачивание файлов
      if (update.message.voice) {
        messageType = 'voice';
        if (!messageText) messageText = update.message.caption || '[Голосовое сообщение]';
        attachmentData = await processTelegramFile({
          fileId: update.message.voice.file_id,
          type: 'voice',
          mimeType: 'audio/ogg',
          ext: 'ogg'
        });
      } else if (update.message.photo) {
        messageType = 'image';
        if (!messageText) messageText = update.message.caption || '[Фото]';
        const photo = update.message.photo[update.message.photo.length - 1]; // Берем лучшее качество
        attachmentData = await processTelegramFile({
          fileId: photo.file_id,
          type: 'photo',
          mimeType: 'image/jpeg',
          ext: 'jpg'
        });
      } else if (update.message.document) {
        messageType = 'file';
        if (!messageText) messageText = update.message.caption || '[Файл]';
        const doc = update.message.document;
        attachmentData = await processTelegramFile({
          fileId: doc.file_id,
          type: 'document',
          mimeType: doc.mime_type || 'application/octet-stream',
          ext: doc.file_name ? doc.file_name.split('.').pop() : 'bin'
        });
      } else if (update.message.sticker) {
        messageType = 'image';
        messageText = '[Стикер]';
        attachmentData = await processTelegramFile({
          fileId: update.message.sticker.file_id,
          type: 'sticker',
          mimeType: 'image/webp',
          ext: 'webp'
        });
      } else if (update.message.video) {
        messageType = 'video';
        if (!messageText) messageText = update.message.caption || '[Видео]';
        attachmentData = await processTelegramFile({
          fileId: update.message.video.file_id,
          type: 'video',
          mimeType: update.message.video.mime_type || 'video/mp4',
          ext: 'mp4'
        });
      } else if (update.message.video_note) {
        messageType = 'video_note';
        messageText = '[Видеообращение]';
        attachmentData = await processTelegramFile({
          fileId: update.message.video_note.file_id,
          type: 'video_note',
          mimeType: 'video/mp4',
          ext: 'mp4'
        });
      }

      // Обработка команд
      if (messageText && messageText.startsWith('/')) {
        if (messageText === '/start') {
          // Теперь это безопасно отправляет сообщение с восклицательным знаком
          await sendMessageToUser(telegramUserId, 'Привет! Я бот поддержки CRM системы. Напишите ваше сообщение, и менеджер свяжется с вами.');
        }
        return res.status(200).end();
      }

      // Отправка в CRM
      const leadId = await sendMessageToCRM(
        telegramUserId,
        messageText,
        telegramUserInfo,
        req,
        messageType,
        attachmentData,
        replyToMessageId,
        messageId
      );

      if (!leadId) {
        await sendMessageToUser(telegramUserId, 'Произошла ошибка при отправке сообщения. Попробуйте позже.');
      }
    }

    // --- Обработка callback (нажатие кнопок) ---
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const telegramUserId = callbackQuery.from.id;
      const messageText = callbackQuery.data;
      const telegramUserInfo = callbackQuery.from;

      console.log(`[bot.js] Received callback_query: "${messageText}" from user ${telegramUserId}`);

      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      if (TELEGRAM_BOT_TOKEN) {
        // Убираем часики загрузки
        axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id
        }).catch(err => console.error('[bot.js] Error answering callback:', err.message));

        // Эхо сообщения в чат для наглядности действия
        axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: telegramUserId,
          text: messageText
        }).catch(err => console.error('[bot.js] Error echoing callback:', err.message));
      }

      await sendMessageToCRM(telegramUserId, messageText, telegramUserInfo, req);
    }

    // --- Обработка реакций ---
    if (update.message_reaction) {
      const reaction = update.message_reaction;
      const tgMessageId = reaction.message_id;
      const newReactions = reaction.new_reaction;

      const { data: messageData } = await supabase
        .from('messages')
        .select('id, lead_id, content, reactions')
        .eq('message_id_tg', tgMessageId)
        .maybeSingle();

      if (messageData) {
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

        const { data: updatedMessage, error: updateError } = await supabase
          .from('messages')
          .update({ reactions: mergedReactions })
          .eq('id', messageData.id)
          .select('*') // Explicitly select all to ensure content is present
          .single();

        if (!updateError && updatedMessage) {
          console.log(`[bot.js] Updated reactions for message ${messageData.id}. Content present: ${!!updatedMessage.content}`);
          const io = req.app.get('io');
          if (io) {
            io.emit('message_updated', updatedMessage);
            if (updatedMessage.lead_id) {
              io.to(`lead_${updatedMessage.lead_id}`).emit('message_updated', updatedMessage);
            }
          }
        }
      }
    }

    res.status(200).end();
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/webhook', (req, res) => {
  res.json({ status: 'ok', message: 'Telegram webhook endpoint' });
});

module.exports = router;
module.exports.sendMessageToUser = sendMessageToUser;
module.exports.escapeMarkdownV2 = escapeMarkdownV2;
