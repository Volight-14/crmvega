const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const axios = require('axios');
const crypto = require('crypto');
const { runAutomations } = require('../services/automationRunner');

const multer = require('multer');
const FormData = require('form-data');
const { convertToOgg } = require('../utils/audioConverter');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Настройка multer для загрузки файлов в память
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Функция для отправки сообщения через Telegram бота
async function sendMessageToTelegram(telegramUserId, message) {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN не установлен');
      return false;
    }

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

// Функция для отслеживания ответа оператора (сравнение с AI подсказкой)
async function trackOperatorResponse(leadId, content) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return;
    }

    await axios.post(
      `${process.env.SUPABASE_URL}/functions/v1/track-operator-response`,
      {
        type: 'INSERT',
        record: {
          lead_id: leadId,
          content: content,
          author_type: 'Оператор',
          timestamp: Math.floor(Date.now() / 1000)
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 секунд таймаут, не блокируем основной запрос
      }
    );

    console.log(`[TrackResponse] Tracked operator response for lead ${leadId}`);
  } catch (error) {
    // Не критичная ошибка - просто логируем
    console.error('Error tracking operator response:', error.message);
  }
}

// Получить сообщения для заявки
router.get('/lead/:leadId', auth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('messages')
      .select(`*`)
      .eq('main_id', leadId)
      .order('"Created Date"', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить все сообщения контакта (из всех заявок)
router.get('/contact/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { limit = 200, offset = 0 } = req.query;

    // Оптимизированный запрос: получаем контакт с заявками одним запросом
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select(`
        id,
        telegram_user_id,
        orders(id, main_id, OrderName)
      `)
      .eq('id', contactId)
      .single();

    if (contactError) throw contactError;

    console.log(`[GET /contact/${contactId}] Found ${contact?.orders?.length || 0} orders`);

    // Собираем все main_id в Set для уникальности
    const leadIds = new Set();

    // Добавляем telegram_user_id контакта
    if (contact?.telegram_user_id) {
      const tgId = String(contact.telegram_user_id);
      console.log(`[GET /contact/${contactId}] Adding TG ID:`, tgId);
      leadIds.add(tgId);
    }

    // Добавляем main_id из всех заявок
    contact?.orders?.forEach(o => {
      if (o.main_id) {
        leadIds.add(String(o.main_id));
      }
    });

    const leadIdsArray = Array.from(leadIds);
    console.log(`[GET /contact/${contactId}] Final leadIds to search:`, leadIdsArray);

    // Получаем сообщения одним запросом
    let allMessages = [];
    if (leadIdsArray.length > 0) {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .in('main_id', leadIdsArray)
        .order('"Created Date"', { ascending: true });

      if (messagesError) throw messagesError;
      allMessages = messages || [];
    }

    // Убираем дубликаты по id и применяем пагинацию
    const uniqueMessages = allMessages
      .filter((msg, index, self) => index === self.findIndex(m => m.id === msg.id))
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json(uniqueMessages);
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить сообщение контакту (создает или использует активную заявку)
router.post('/contact/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { content, sender_type = 'manager' } = req.body;

    // Находим активную заявку контакта или создаем новую
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('id, main_id')
      .eq('contact_id', contactId)
      .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let orderId = activeOrder?.id;
    let leadId = activeOrder?.main_id;
    console.log(`[POST /contact/${contactId}] Initial: orderId=${orderId}, leadId=${leadId}`);

    // Если нет активной заявки, создаем новую
    if (!orderId) {
      console.log(`[POST /contact/${contactId}] No active order. Creating new.`);
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: parseInt(contactId),
          title: `Сообщение от ${new Date().toLocaleDateString('ru-RU')}`,
          status: 'new',
          type: 'inquiry',
          manager_id: req.manager.id,
        })
        .select()
        .single();

      if (orderError) throw orderError;
      orderId = newOrder.id;
      console.log(`[POST /contact/${contactId}] Created new order:`, newOrder.id);
    }

    // Генерируем leadId (thread ID) если нет
    if (!leadId) {
      // Если у заявки нет ID чата, генерируем новый NUMERIC ID
      leadId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
      console.log(`[POST /contact/${contactId}] Generated new leadId:`, leadId);

      await supabase
        .from('orders')
        .update({ main_id: leadId }) // Обновляем только main_id
        .eq('id', orderId);
    }

    console.log(`[POST /contact/${contactId}] Final leadId for message:`, leadId);

    // Если сообщение от менеджера, отправляем через Telegram бота (если есть telegram_user_id)
    let telegramMessageId = null;
    let messageStatus = 'delivered';
    let errorMessage = null;

    if (sender_type === 'manager' && leadId) {
      // Ищем contact telegram_id
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', contactId)
        .single();

      if (contact && contact.telegram_user_id) {
        try {
          const sent = await sendMessageToTelegram(contact.telegram_user_id, content);
          // sendMessageToTelegram returns boolean, but we need ID and error details. 
          // Let's refactor inline or use a better helper.
          // Inline for now to capture errors precisely.
          const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
          if (TELEGRAM_BOT_TOKEN) {
            const tgResponse = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              chat_id: contact.telegram_user_id,
              text: content
            });
            telegramMessageId = tgResponse.data?.result?.message_id;
          }
        } catch (err) {
          console.error('Failed to send message via bot:', err.response?.data || err.message);
          const errorCode = err.response?.data?.error_code;
          if (errorCode === 403) {
            messageStatus = 'blocked';
            errorMessage = 'Пользователь заблокировал бота';
          } else if (errorCode === 400) {
            messageStatus = 'deleted_chat'; // or generic error
            errorMessage = 'Пользователь удалил чат с ботом';
          } else {
            messageStatus = 'error';
            errorMessage = err.response?.data?.description || err.message;
          }
        }
      }

      // Трекаем ответ для аналитики AI
      trackOperatorResponse(leadId, content).catch(err => {
        console.error('Failed to track operator response:', err);
      });
    }

    // Создаем сообщение
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        main_id: leadId,
        content,
        author_type: sender_type === 'user' ? 'user' : 'Менеджер',
        status: messageStatus,
        error_message: errorMessage,
        message_id_tg: telegramMessageId,
        'Created Date': new Date().toISOString(),
      })
      .select(`*`)
      .single();

    if (messageError) throw messageError;

    // Обновляем last_message_at у контакта
    await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', contactId);

    // Связываем сообщение с заявкой
    if (orderId && message && message.id) {
      await supabase
        .from('order_messages')
        .upsert({
          order_id: orderId,
          message_id: message.id,
        }, { onConflict: 'order_id,message_id' });
    }

    const io = req.app.get('io');
    // Отправляем Socket.IO событие
    if (io) {
      if (leadId) io.to(`lead_${leadId}`).emit('new_message', message);
      io.to(`order_${orderId}`).emit('new_message', message);
      io.emit('contact_message', { contact_id: contactId, message });
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending message to contact:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить голосовое сообщение контакту
router.post('/contact/:contactId/voice', auth, upload.single('voice'), async (req, res) => {
  try {
    const { contactId } = req.params;
    const { duration } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не найден' });
    }

    console.log(`[VoiceContact] Processing for contact ${contactId}, duration=${duration}`);

    // 1. Находим активную заявку контакта или создаем новую (Logic duplicated from text message route)
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('id, main_id')
      .eq('contact_id', contactId)
      .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let orderId = activeOrder?.id;
    let leadId = activeOrder?.main_id;

    if (!orderId) {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: parseInt(contactId),
          title: `Сообщение от ${new Date().toLocaleDateString('ru-RU')}`,
          status: 'new',
          type: 'inquiry',
          manager_id: req.manager.id,
        })
        .select()
        .single();

      if (orderError) throw orderError;
      orderId = newOrder.id;
    }

    if (!leadId) {
      leadId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
      await supabase.from('orders').update({ main_id: leadId }).eq('id', orderId);
    }

    // 2. Convert to OGG/Opus
    let finalBuffer = req.file.buffer;
    let finalContentType = 'audio/ogg';
    let finalFileName = `${Date.now()}_voice.ogg`;

    try {
      finalBuffer = await convertToOgg(req.file.buffer, req.file.originalname);
    } catch (convError) {
      console.error('[VoiceContact] Conversion failed:', convError);
    }

    // 3. Upload to Supabase
    const filePath = `order_files/${orderId}/${finalFileName}`;
    await supabase.storage
      .from('attachments')
      .upload(filePath, finalBuffer, { contentType: finalContentType });

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

    // 4. Send to Telegram
    let telegramMessageId = null;
    const { data: contact } = await supabase.from('contacts').select('telegram_user_id').eq('id', contactId).single();

    if (contact && contact.telegram_user_id && process.env.TELEGRAM_BOT_TOKEN) {
      const form = new FormData();
      form.append('chat_id', contact.telegram_user_id);
      form.append('voice', finalBuffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
      if (duration) form.append('duration', duration);

      try {
        const tgResponse = await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendVoice`,
          form,
          { headers: form.getHeaders() }
        );
        telegramMessageId = tgResponse.data?.result?.message_id;
      } catch (tgError) {
        console.error('[VoiceContact] Telegram Error:', tgError.response?.data || tgError.message);
      }
    }

    // 5. Save to DB
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        main_id: leadId,
        content: '🎤 Голосовое сообщение',
        author_type: 'Оператор', // Or 'Менеджер'? Text route uses checks. Let's strictly say 'Оператор' for consistency with voice
        message_type: 'voice',
        message_id_tg: telegramMessageId,
        file_url: fileUrl,
        voice_duration: duration ? parseInt(duration) : null,
        'Created Date': new Date().toISOString(),
        is_outgoing: true
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Связываем с заявкой
    await supabase
      .from('order_messages')
      .upsert({
        order_id: orderId,
        message_id: message.id,
      }, { onConflict: 'order_id,message_id' });

    // Update contact last message
    await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', contactId);

    // Socket Emit
    const io = req.app.get('io');
    if (io) {
      if (leadId) io.to(`lead_${leadId}`).emit('new_message', message);
      io.to(`order_${orderId}`).emit('new_message', message);
      io.emit('contact_message', { contact_id: contactId, message });
    }

    res.json(message);

  } catch (error) {
    console.error('[VoiceContact] Error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить файл контакту
router.post('/contact/:contactId/file', auth, upload.single('file'), async (req, res) => {
  try {
    const { contactId } = req.params;
    const { caption } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не найден' });
    }

    console.log(`[FileContact] Processing file for contact ${contactId}`);

    // 1. Находим активную заявку контакта или создаем новую
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('id, main_id')
      .eq('contact_id', contactId)
      .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let orderId = activeOrder?.id;
    let leadId = activeOrder?.main_id;

    if (!orderId) {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: parseInt(contactId),
          title: `Сообщение от ${new Date().toLocaleDateString('ru-RU')}`,
          status: 'new',
          type: 'inquiry',
          manager_id: req.manager.id,
        })
        .select()
        .single();

      if (orderError) throw orderError;
      orderId = newOrder.id;
    }

    if (!leadId) {
      leadId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
      await supabase.from('orders').update({ main_id: leadId }).eq('id', orderId);
    }

    // 2. Upload to Supabase
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `order_files/${orderId}/${fileName}`;

    // Helper to determine content type
    let contentType = req.file.mimetype;
    // Fix for some common types if needed, but req.file.mimetype is usually good

    await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, { contentType });

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

    // 3. Send to Telegram
    let telegramMessageId = null;
    const { data: contact } = await supabase.from('contacts').select('telegram_user_id').eq('id', contactId).single();

    if (contact && contact.telegram_user_id && process.env.TELEGRAM_BOT_TOKEN) {
      const form = new FormData();
      form.append('chat_id', contact.telegram_user_id);

      const isImage = contentType.startsWith('image/');
      const endpoint = isImage ? 'sendPhoto' : 'sendDocument';
      const fieldName = isImage ? 'photo' : 'document';

      form.append(fieldName, req.file.buffer, { filename: req.file.originalname, contentType });
      if (caption) form.append('caption', caption);

      try {
        const tgResponse = await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${endpoint}`,
          form,
          { headers: form.getHeaders() }
        );
        telegramMessageId = tgResponse.data?.result?.message_id;
      } catch (tgError) {
        console.error('[FileContact] Telegram Error:', tgError.response?.data || tgError.message);
      }
    }

    // 4. Save to DB
    const isImage = contentType.startsWith('image/');
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        main_id: leadId,
        content: caption || (isImage ? 'Картинка' : 'Файл'),
        author_type: 'Оператор', // Or 'Менеджер'
        message_type: isImage ? 'image' : 'file',
        message_id_tg: telegramMessageId,
        file_url: fileUrl,
        file_name: req.file.originalname,
        caption: caption,
        'Created Date': new Date().toISOString(),
        is_outgoing: true
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Связываем с заявкой
    await supabase
      .from('order_messages')
      .upsert({
        order_id: orderId,
        message_id: message.id,
      }, { onConflict: 'order_id,message_id' });

    // Update contact last message
    await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', contactId);

    // Socket Emit
    const io = req.app.get('io');
    if (io) {
      if (leadId) io.to(`lead_${leadId}`).emit('new_message', message);
      io.to(`order_${orderId}`).emit('new_message', message);
      io.emit('contact_message', { contact_id: contactId, message });
    }

    res.json(message);

  } catch (error) {
    console.error('[FileContact] Error:', error);
    res.status(400).json({ error: error.message });
  }
});

// REMOVED: Generic POST /messages/ endpoint - not used in frontend
// Use /messages/contact/:contactId or /order-messages/:orderId/client instead

module.exports = router;
