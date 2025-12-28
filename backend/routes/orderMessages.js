const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

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

// ==============================================
// СООБЩЕНИЯ КЛИЕНТУ (из Telegram через Bubble или напрямую)
// ==============================================

// Получить все сообщения заявки
router.get('/:orderId/client', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit = 200, offset = 0 } = req.query;

    // Получаем заявку - нужен только main_id
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, main_id')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    // Если нет main_id - нет сообщений
    if (!order.main_id) {
      return res.json({
        messages: [],
        total: 0,
        mainId: null,
      });
    }

    // Один оптимизированный запрос для всех сообщений
    const { data: messages, count, error: messagesError } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('main_id', order.main_id)
      .order('Created Date', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (messagesError) throw messagesError;

    res.json({
      messages: messages || [],
      total: count || 0,
      mainId: order.main_id,
    });
  } catch (error) {
    console.error('Error fetching order client messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить сообщение клиенту в Telegram
router.post('/:orderId/client', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { content, reply_to_message_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    // Получаем заявку
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, contact_id, main_id')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    // Находим telegram_user_id клиента
    let telegramUserId = null;

    if (order.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', order.contact_id)
        .single();
      telegramUserId = contact?.telegram_user_id;
    }

    if (!telegramUserId) {
      return res.status(400).json({ error: 'Не найден Telegram ID клиента' });
    }

    // Отправляем в Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    let telegramMessageId = null;

    if (TELEGRAM_BOT_TOKEN) {
      try {
        // Импортируем функцию экранирования
        const { escapeMarkdownV2 } = require('./bot');

        const telegramPayload = {
          chat_id: telegramUserId,
          text: escapeMarkdownV2(content),
          parse_mode: 'MarkdownV2', // Включаем поддержку Markdown
        };

        if (reply_to_message_id) {
          telegramPayload.reply_to_message_id = reply_to_message_id;
        }

        const response = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          telegramPayload
        );
        telegramMessageId = response.data?.result?.message_id;
      } catch (tgError) {
        console.error('Telegram send error:', tgError.response?.data || tgError.message);

        // Если ошибка связана с парсингом Markdown, пробуем отправить без форматирования
        if (tgError.response?.data?.description?.includes('parse')) {
          try {
            console.log('[orderMessages] Retrying without MarkdownV2 due to parse error');
            const telegramPayload = {
              chat_id: telegramUserId,
              text: content, // Отправляем оригинальный текст без экранирования
            };

            if (reply_to_message_id) {
              telegramPayload.reply_to_message_id = reply_to_message_id;
            }

            const response = await axios.post(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
              telegramPayload
            );
            telegramMessageId = response.data?.result?.message_id;
          } catch (retryError) {
            console.error('Retry send error:', retryError.response?.data || retryError.message);
            return res.status(400).json({ error: 'Ошибка отправки в Telegram: ' + (retryError.response?.data?.description || retryError.message) });
          }
        } else {
          return res.status(400).json({ error: 'Ошибка отправки в Telegram: ' + (tgError.response?.data?.description || tgError.message) });
        }
      }
    }

    // Сохраняем сообщение в базе
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: order.main_id, // Backward compatibility if needed, using main_id value
        main_id: order.main_id,
        content: content.trim(),
        author_type: 'Оператор',
        message_type: 'text',
        message_id_tg: telegramMessageId,
        reply_to_mess_id_tg: reply_to_message_id || null,
        'Created Date': new Date().toISOString(),
        user: req.manager.name || req.manager.email,
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Связываем сообщение с заявкой
    await supabase
      .from('order_messages')
      .upsert({
        order_id: parseInt(orderId),
        message_id: message.id,
      }, { onConflict: 'order_id,message_id' });

    // Socket.IO уведомление
    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_client_message', message);
      if (order.main_id) {
        io.to(`lead_${order.main_id}`).emit('new_message', message);
      }
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending client message:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить файл клиенту
router.post('/:orderId/client/file', auth, upload.single('file'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { caption, reply_to_message_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Получаем заявку
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, contact_id, main_id')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    let telegramUserId = null;

    if (order.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', order.contact_id)
        .single();
      telegramUserId = contact?.telegram_user_id;
    }

    if (!telegramUserId) {
      return res.status(400).json({ error: 'Не найден Telegram ID клиента' });
    }

    // Загружаем файл в Supabase Storage
    // Sanitize filename for storage and DB to avoid encoding issues
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const ext = originalName.split('.').pop();
    const fileName = `${Date.now()}_file.${ext}`;
    const filePath = `order_files/${orderId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
    }

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

    // Отправляем в Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    let telegramMessageId = null;

    if (TELEGRAM_BOT_TOKEN) {
      try {
        const formData = new FormData();
        formData.append('chat_id', telegramUserId);

        // Ensure filename is handled correctly by formData
        const fileOptions = {
          filename: originalName,
          contentType: req.file.mimetype,
        };

        formData.append('document', req.file.buffer, fileOptions);

        if (caption) {
          formData.append('caption', caption);
        }
        if (reply_to_message_id) {
          formData.append('reply_to_message_id', reply_to_message_id);
        }

        const response = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
          formData,
          { headers: formData.getHeaders() }
        );
        telegramMessageId = response.data?.result?.message_id;
      } catch (tgError) {
        console.error('Telegram file send error:', tgError.response?.data || tgError.message);
        return res.status(400).json({ error: 'Ошибка отправки файла в Telegram' });
      }
    }

    // ID для привязки
    const storeLeadId = order.main_id || order.lead_id;

    // Сохраняем сообщение
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: storeLeadId,
        main_id: order.main_id,
        content: caption ? caption.trim() : '', // Avoid duplicate filename in content
        author_type: 'Оператор',
        message_type: 'file',
        message_id_tg: telegramMessageId,
        reply_to_mess_id_tg: reply_to_message_id || null,
        file_url: fileUrl,
        file_name: originalName,
        'Created Date': new Date().toISOString(),
        user: req.manager.name || req.manager.email,
      })
      .select()
      .single();

    if (messageError) throw messageError;

    await supabase
      .from('order_messages')
      .upsert({
        order_id: parseInt(orderId),
        message_id: message.id,
      }, { onConflict: 'order_id,message_id' });

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_client_message', message);
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending file:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить голосовое сообщение
router.post('/:orderId/client/voice', auth, upload.single('voice'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { duration, reply_to_message_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Голосовое сообщение не загружено' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, contact_id, lead_id, main_id')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    let telegramUserId = null;

    if (order.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', order.contact_id)
        .single();
      telegramUserId = contact?.telegram_user_id;
    }

    if (!telegramUserId) {
      return res.status(400).json({ error: 'Не найден Telegram ID клиента' });
    }

    const fileName = `${Date.now()}_voice.ogg`;
    const filePath = `order_files/${orderId}/${fileName}`;

    await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, {
        contentType: 'audio/ogg',
      });

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    let telegramMessageId = null;

    if (TELEGRAM_BOT_TOKEN) {
      try {
        const buffer = req.file.buffer;
        // Check if file is OGG (Magic bytes: OggS -> 0x4F 0x67 0x67 0x53)
        const isOgg = buffer.length >= 4 && buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53;

        // Check if file is WebM (Magic bytes: 0x1A 0x45 0xDF 0xA3)
        const isWebM = buffer.length >= 4 && buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;

        const formData = new FormData();
        formData.append('chat_id', telegramUserId);

        let method = 'sendVoice';

        if (isOgg) {
          formData.append('voice', buffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
        } else {
          console.log(`[Voice] Detected non-OGG signature. WebM=${isWebM}. Sending as document.`);
          method = 'sendDocument';
          const ext = isWebM ? 'webm' : 'm4a'; // Fallback extension
          const mime = isWebM ? 'audio/webm' : 'audio/mp4';
          formData.append('document', buffer, { filename: `voice.${ext}`, contentType: mime });
        }

        if (duration) {
          formData.append('duration', duration);
        }
        if (reply_to_message_id) {
          formData.append('reply_to_message_id', reply_to_message_id);
        }

        const response = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
          formData,
          { headers: formData.getHeaders() }
        );
        telegramMessageId = response.data?.result?.message_id;
      } catch (tgError) {
        console.error('Telegram voice send error:', tgError.response?.data || tgError.message);
        return res.status(400).json({ error: 'Ошибка отправки голосового в Telegram: ' + (tgError.response?.data?.description || tgError.message) });
      }
    }

    const storeLeadId = order.main_id || order.lead_id;

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: storeLeadId,
        main_id: order.main_id,
        content: '🎤 Голосовое сообщение',
        author_type: 'Оператор',
        message_type: 'voice',
        message_id_tg: telegramMessageId,
        reply_to_mess_id_tg: reply_to_message_id || null,
        file_url: fileUrl,
        voice_duration: duration ? parseInt(duration) : null,
        'Created Date': new Date().toISOString(),
        user: req.manager.name || req.manager.email,
      })
      .select()
      .single();

    if (messageError) throw messageError;

    await supabase
      .from('order_messages')
      .upsert({
        order_id: parseInt(orderId),
        message_id: message.id,
      }, { onConflict: 'order_id,message_id' });

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_client_message', message);
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending voice:', error);
    res.status(400).json({ error: error.message });
  }
});

// ==============================================
// ВНУТРЕННЯЯ ПЕРЕПИСКА (между сотрудниками)
// ==============================================

// Получить внутренние сообщения заявки
router.get('/:orderId/internal', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit = 200, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('internal_messages')
      .select(`
        *,
        sender:managers(id, name, email),
        reply_to:internal_messages!reply_to_id(
          id,
          content,
          sender:managers(name)
        )
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    const { count } = await supabase
      .from('internal_messages')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', orderId);

    res.json({
      messages: data || [],
      total: count || 0,
    });
  } catch (error) {
    console.error('Error fetching internal messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить внутреннее сообщение
router.post('/:orderId/internal', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { content, reply_to_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    const { data, error } = await supabase
      .from('internal_messages')
      .insert({
        order_id: parseInt(orderId),
        sender_id: req.manager.id,
        content: content.trim(),
        reply_to_id: reply_to_id || null,
      })
      .select(`
        *,
        sender:managers(id, name, email),
        reply_to:internal_messages!reply_to_id(
          id,
          content,
          sender:managers(name)
        )
      `)
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_internal_message', data);
      io.emit('internal_message', { order_id: orderId, message: data });
    }

    res.json(data);
  } catch (error) {
    console.error('Error sending internal message:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить внутренний файл
router.post('/:orderId/internal/file', auth, upload.single('file'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reply_to_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const fileName = `${Date.now()}_${req.file.originalname}`;
    const filePath = `internal_files/${orderId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
    }

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

    const { data, error } = await supabase
      .from('internal_messages')
      .insert({
        order_id: parseInt(orderId),
        sender_id: req.manager.id,
        content: `📎 ${req.file.originalname}`,
        reply_to_id: reply_to_id || null,
        attachment_url: fileUrl,
        attachment_type: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
        attachment_name: req.file.originalname,
      })
      .select(`
        *,
        sender:managers(id, name, email)
      `)
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_internal_message', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error sending internal file:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отметить внутренние сообщения как прочитанные
router.post('/:orderId/internal/read', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message_ids } = req.body;

    let query = supabase
      .from('internal_messages')
      .update({ is_read: true })
      .eq('order_id', orderId);

    if (message_ids && message_ids.length > 0) {
      query = query.in('id', message_ids);
    }

    query = query.neq('sender_id', req.manager.id);

    const { error } = await query;

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить количество непрочитанных внутренних сообщений
router.get('/:orderId/internal/unread', auth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const { count, error } = await supabase
      .from('internal_messages')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('is_read', false)
      .neq('sender_id', req.manager.id);

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
