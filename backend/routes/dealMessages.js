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
// СООБЩЕНИЯ КЛИЕНТУ (из Telegram через Bubble)
// ==============================================

// Получить все сообщения сделки (из messages через lead_id чата)
router.get('/:dealId/client', auth, async (req, res) => {
  try {
    const { dealId } = req.params;
    const { limit = 200, offset = 0 } = req.query;

    // Получаем сделку и связанный чат
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id, contact_id, lead_id')
      .eq('id', dealId)
      .single();

    if (dealError) throw dealError;

    // Получаем чат по lead_id или contact_id
    let chatLeadId = null;

    if (deal.lead_id) {
      // Если у сделки есть lead_id - используем его
      const { data: chat } = await supabase
        .from('chats')
        .select('lead_id')
        .eq('id', deal.lead_id)
        .single();
      chatLeadId = chat?.lead_id;
    }

    if (!chatLeadId && deal.contact_id) {
      // Ищем чат по telegram_user_id контакта
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', deal.contact_id)
        .single();

      if (contact?.telegram_user_id) {
        // Ищем чат с этим telegram_user_id
        const { data: chats } = await supabase
          .from('chats')
          .select('lead_id')
          .eq('client', contact.telegram_user_id.toString())
          .order('Created Date', { ascending: false })
          .limit(1);

        chatLeadId = chats?.[0]?.lead_id;
      }
    }

    // Также ищем сообщения через deal_messages
    const { data: dealMessages } = await supabase
      .from('deal_messages')
      .select('message_id')
      .eq('deal_id', dealId);

    const messageIds = dealMessages?.map(dm => dm.message_id) || [];

    let allMessages = [];

    // Получаем сообщения по lead_id
    if (chatLeadId) {
      const { data: messagesByLead } = await supabase
        .from('messages')
        .select('*')
        .eq('lead_id', chatLeadId)
        .order('Created Date', { ascending: true });

      if (messagesByLead) {
        allMessages = [...messagesByLead];
      }
    }

    // Добавляем сообщения из deal_messages
    if (messageIds.length > 0) {
      const { data: messagesByDeal } = await supabase
        .from('messages')
        .select('*')
        .in('id', messageIds)
        .order('Created Date', { ascending: true });

      if (messagesByDeal) {
        const existingIds = new Set(allMessages.map(m => m.id));
        for (const msg of messagesByDeal) {
          if (!existingIds.has(msg.id)) {
            allMessages.push(msg);
          }
        }
      }
    }

    // Сортируем по дате
    allMessages.sort((a, b) => {
      const dateA = new Date(a['Created Date'] || a.timestamp || 0);
      const dateB = new Date(b['Created Date'] || b.timestamp || 0);
      return dateA.getTime() - dateB.getTime();
    });

    // Применяем пагинацию
    const paginatedMessages = allMessages.slice(offset, offset + parseInt(limit));

    res.json({
      messages: paginatedMessages,
      total: allMessages.length,
      chatLeadId,
    });
  } catch (error) {
    console.error('Error fetching deal client messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить сообщение клиенту в Telegram
router.post('/:dealId/client', auth, async (req, res) => {
  try {
    const { dealId } = req.params;
    const { content, reply_to_message_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    // Получаем сделку и чат
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id, contact_id, lead_id')
      .eq('id', dealId)
      .single();

    if (dealError) throw dealError;

    // Находим telegram_user_id клиента
    let telegramUserId = null;
    let chatLeadId = null;

    if (deal.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', deal.contact_id)
        .single();
      telegramUserId = contact?.telegram_user_id;
    }

    // Ищем lead_id для записи сообщения
    if (deal.lead_id) {
      const { data: chat } = await supabase
        .from('chats')
        .select('lead_id, client')
        .eq('id', deal.lead_id)
        .single();
      chatLeadId = chat?.lead_id;
      if (!telegramUserId && chat?.client) {
        telegramUserId = chat.client;
      }
    }

    if (!telegramUserId) {
      return res.status(400).json({ error: 'Не найден Telegram ID клиента' });
    }

    // Отправляем в Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    let telegramMessageId = null;

    if (TELEGRAM_BOT_TOKEN) {
      try {
        const telegramPayload = {
          chat_id: telegramUserId,
          text: content,
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
        return res.status(400).json({ error: 'Ошибка отправки в Telegram: ' + (tgError.response?.data?.description || tgError.message) });
      }
    }

    // Сохраняем сообщение в базе
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: chatLeadId,
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

    // Связываем сообщение со сделкой
    await supabase
      .from('deal_messages')
      .upsert({
        deal_id: parseInt(dealId),
        message_id: message.id,
      }, { onConflict: 'deal_id,message_id' });

    // Socket.IO уведомление
    const io = req.app.get('io');
    if (io) {
      io.to(`deal_${dealId}`).emit('new_client_message', message);
      if (chatLeadId) {
        io.to(`lead_${chatLeadId}`).emit('new_message', message);
      }
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending client message:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить файл клиенту
router.post('/:dealId/client/file', auth, upload.single('file'), async (req, res) => {
  try {
    const { dealId } = req.params;
    const { caption, reply_to_message_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Получаем сделку
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id, contact_id, lead_id')
      .eq('id', dealId)
      .single();

    if (dealError) throw dealError;

    // Находим telegram_user_id
    let telegramUserId = null;
    let chatLeadId = null;

    if (deal.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', deal.contact_id)
        .single();
      telegramUserId = contact?.telegram_user_id;
    }

    if (deal.lead_id) {
      const { data: chat } = await supabase
        .from('chats')
        .select('lead_id, client')
        .eq('id', deal.lead_id)
        .single();
      chatLeadId = chat?.lead_id;
      if (!telegramUserId && chat?.client) {
        telegramUserId = chat.client;
      }
    }

    if (!telegramUserId) {
      return res.status(400).json({ error: 'Не найден Telegram ID клиента' });
    }

    // Загружаем файл в Supabase Storage
    const fileName = `${Date.now()}_${req.file.originalname}`;
    const filePath = `deal_files/${dealId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      // Продолжаем без сохранения файла локально
    }

    // Получаем публичный URL
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
        formData.append('document', req.file.buffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype,
        });
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

    // Сохраняем сообщение
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: chatLeadId,
        content: caption || `📎 ${req.file.originalname}`,
        author_type: 'Оператор',
        message_type: 'file',
        message_id_tg: telegramMessageId,
        reply_to_mess_id_tg: reply_to_message_id || null,
        file_url: fileUrl,
        file_name: req.file.originalname,
        'Created Date': new Date().toISOString(),
        user: req.manager.name || req.manager.email,
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Связываем со сделкой
    await supabase
      .from('deal_messages')
      .upsert({
        deal_id: parseInt(dealId),
        message_id: message.id,
      }, { onConflict: 'deal_id,message_id' });

    const io = req.app.get('io');
    if (io) {
      io.to(`deal_${dealId}`).emit('new_client_message', message);
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending file:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить голосовое сообщение
router.post('/:dealId/client/voice', auth, upload.single('voice'), async (req, res) => {
  try {
    const { dealId } = req.params;
    const { duration, reply_to_message_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Голосовое сообщение не загружено' });
    }

    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id, contact_id, lead_id')
      .eq('id', dealId)
      .single();

    if (dealError) throw dealError;

    let telegramUserId = null;
    let chatLeadId = null;

    if (deal.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', deal.contact_id)
        .single();
      telegramUserId = contact?.telegram_user_id;
    }

    if (deal.lead_id) {
      const { data: chat } = await supabase
        .from('chats')
        .select('lead_id, client')
        .eq('id', deal.lead_id)
        .single();
      chatLeadId = chat?.lead_id;
      if (!telegramUserId && chat?.client) {
        telegramUserId = chat.client;
      }
    }

    if (!telegramUserId) {
      return res.status(400).json({ error: 'Не найден Telegram ID клиента' });
    }

    // Загружаем в Storage
    const fileName = `${Date.now()}_voice.ogg`;
    const filePath = `deal_files/${dealId}/${fileName}`;

    await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, {
        contentType: 'audio/ogg',
      });

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
        formData.append('voice', req.file.buffer, {
          filename: 'voice.ogg',
          contentType: 'audio/ogg',
        });
        if (duration) {
          formData.append('duration', duration);
        }
        if (reply_to_message_id) {
          formData.append('reply_to_message_id', reply_to_message_id);
        }

        const response = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
          formData,
          { headers: formData.getHeaders() }
        );
        telegramMessageId = response.data?.result?.message_id;
      } catch (tgError) {
        console.error('Telegram voice send error:', tgError.response?.data || tgError.message);
        return res.status(400).json({ error: 'Ошибка отправки голосового в Telegram' });
      }
    }

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: chatLeadId,
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
      .from('deal_messages')
      .upsert({
        deal_id: parseInt(dealId),
        message_id: message.id,
      }, { onConflict: 'deal_id,message_id' });

    const io = req.app.get('io');
    if (io) {
      io.to(`deal_${dealId}`).emit('new_client_message', message);
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

// Получить внутренние сообщения сделки
router.get('/:dealId/internal', auth, async (req, res) => {
  try {
    const { dealId } = req.params;
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
      .eq('deal_id', dealId)
      .order('created_at', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    const { count } = await supabase
      .from('internal_messages')
      .select('*', { count: 'exact', head: true })
      .eq('deal_id', dealId);

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
router.post('/:dealId/internal', auth, async (req, res) => {
  try {
    const { dealId } = req.params;
    const { content, reply_to_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    const { data, error } = await supabase
      .from('internal_messages')
      .insert({
        deal_id: parseInt(dealId),
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

    // Socket.IO уведомление
    const io = req.app.get('io');
    if (io) {
      io.to(`deal_${dealId}`).emit('new_internal_message', data);
      io.emit('internal_message', { deal_id: dealId, message: data });
    }

    res.json(data);
  } catch (error) {
    console.error('Error sending internal message:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить внутренний файл
router.post('/:dealId/internal/file', auth, upload.single('file'), async (req, res) => {
  try {
    const { dealId } = req.params;
    const { reply_to_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Загружаем в Storage
    const fileName = `${Date.now()}_${req.file.originalname}`;
    const filePath = `internal_files/${dealId}/${fileName}`;

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
        deal_id: parseInt(dealId),
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
      io.to(`deal_${dealId}`).emit('new_internal_message', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error sending internal file:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отметить внутренние сообщения как прочитанные
router.post('/:dealId/internal/read', auth, async (req, res) => {
  try {
    const { dealId } = req.params;
    const { message_ids } = req.body;

    let query = supabase
      .from('internal_messages')
      .update({ is_read: true })
      .eq('deal_id', dealId);

    if (message_ids && message_ids.length > 0) {
      query = query.in('id', message_ids);
    }

    // Не помечаем свои сообщения как прочитанные (они и так прочитаны)
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
router.get('/:dealId/internal/unread', auth, async (req, res) => {
  try {
    const { dealId } = req.params;

    const { count, error } = await supabase
      .from('internal_messages')
      .select('*', { count: 'exact', head: true })
      .eq('deal_id', dealId)
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

