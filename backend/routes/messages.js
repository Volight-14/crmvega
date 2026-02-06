const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const axios = require('axios');
const crypto = require('crypto');
const { runAutomations } = require('../services/automationRunner');
const { sendMessageToUser } = require('./bot');

const multer = require('multer');
const FormData = require('form-data');
const { convertToOgg } = require('../utils/audioConverter');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Настройка multer для загрузки файлов в память
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

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
      .order('"Created Date"', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json((data || []).reverse());
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
    let targetContactId = contactId;

    // Check for potential Telegram ID usage (BigIntish value)
    // Always try to resolve Telegram ID to internal ID first
    // (User scenario: URL always contains Telegram ID)
    const { data: contactResolve } = await supabase
      .from('contacts')
      .select('id')
      .eq('telegram_user_id', contactId)
      .maybeSingle();

    if (contactResolve) {
      targetContactId = contactResolve.id;
      console.log(`[ContactMessages] Resolved Telegram ID ${contactId} to internal ID: ${targetContactId}`);
    }

    // Оптимизированный запрос: получаем контакт с заявками одним запросом
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select(`
        id,
        telegram_user_id,
        orders(id, main_id, OrderName)
      `)
      .eq('id', targetContactId)
      .single();

    if (contactError) throw contactError;


    // Собираем все main_id в Set для уникальности
    const leadIds = new Set();

    // Добавляем telegram_user_id контакта
    if (contact?.telegram_user_id) {
      const tgId = String(contact.telegram_user_id);
      leadIds.add(tgId);
    }

    // Добавляем main_id из всех заявок
    contact?.orders?.forEach(o => {
      if (o.main_id) {
        leadIds.add(String(o.main_id));
      }
    });

    const leadIdsArray = Array.from(leadIds).map(String);
    let allMessages = [];
    let count = 0;

    console.log(`[ContactMessages] Querying messages for contact ${contactId}`);
    console.log(`[ContactMessages] Lead IDs (count ${leadIdsArray.length}):`, leadIdsArray);
    console.log(`[ContactMessages] Pagination: limit=${limit}, offset=${offset}`);

    if (leadIdsArray.length > 0) {
      const from = parseInt(offset);
      const to = from + parseInt(limit) - 1;

      const { data: messages, count: totalCount, error: messagesError } = await supabase
        .from('messages')
        .select(`
          *,
          sender:managers!manager_id(id, name, email)
        `, { count: 'exact' })
        .or(leadIdsArray.map(id => `main_id.eq.${id}`).join(','))
        .order('"Created Date"', { ascending: false })
        .range(from, to);

      if (messagesError) throw messagesError;
      allMessages = messages || [];
      count = totalCount || 0;
    }

    // Убираем дубликаты по id и разворачиваем (чтобы были от старых к новым)
    const uniqueMessages = allMessages
      .filter((msg, index, self) => index === self.findIndex(m => m.id === msg.id))
      .reverse();

    res.json({
      messages: uniqueMessages,
      total: allMessages.length > 0 ? count : 0 // Safe usage of count
    });
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

    let targetContactId = contactId;
    // Resolve Telegram ID
    const { data: contactResolve } = await supabase.from('contacts').select('id').eq('telegram_user_id', contactId).maybeSingle();
    if (contactResolve) targetContactId = contactResolve.id;

    // Находим активную заявку контакта или создаем новую
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('id, main_id')
      .eq('contact_id', targetContactId)
      .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let orderId = activeOrder?.id;
    let leadId = activeOrder?.main_id;

    // Если нет активной заявки, создаем новую
    if (!orderId) {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: parseInt(targetContactId),
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

    // Генерируем leadId (thread ID) если нет
    if (!leadId) {
      // Если у заявки нет ID чата, генерируем новый NUMERIC ID
      leadId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);

      await supabase
        .from('orders')
        .update({ main_id: leadId }) // Обновляем только main_id
        .eq('id', orderId);
    }

    // Если сообщение от менеджера, отправляем через Telegram бота (если есть telegram_user_id)
    let telegramMessageId = null;
    let messageStatus = 'delivered';
    let errorMessage = null;

    if (sender_type === 'manager' && leadId) {
      // Ищем contact telegram_id
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', targetContactId)
        .single();

      if (contact && contact.telegram_user_id) {
        // Use reliable sender from bot.js
        const success = await sendMessageToUser(contact.telegram_user_id, content);

        if (!success) {
          // We can't easily distinguish 'blocked' vs 'error' without deep axios inspection inside bot.js,
          // but bot.js handles retries. If false, it failed hard.
          // For better detailed error tracking, we'd need sendMessageToUser to return {success, error, code}
          // But assuming general error for now is safer than crashing.
          messageStatus = 'error';
          errorMessage = 'Ошибка отправки в Telegram';
        } else {
          // Success! Note: we don't get message_id back easily from simple helper.
          // If message_id is critical, we'd need to update bot.js to return the full response object.
          // For now, let's assume delivered.
        }
      }

      // Трекаем ответ для аналитики AI
      trackOperatorResponse(leadId, content).catch(err => {
        console.error('Failed to track operator response:', err);
      });
    }

    // Get fresh manager info
    const { data: managerData } = await supabase
      .from('managers')
      .select('name, email')
      .eq('id', req.manager.id)
      .single();

    const senderName = managerData?.name || req.manager.name;
    const senderEmail = managerData?.email || req.manager.email;

    // Truncate fields to match DB constraints (varchar(20))
    const rawAuthor = senderName || (sender_type === 'user' ? 'user' : 'Менеджер');
    const safeAuthorType = rawAuthor.length > 20 ? rawAuthor.substring(0, 20) : rawAuthor;

    const rawUser = senderName || senderEmail || '';
    const safeUser = rawUser.length > 20 ? rawUser.substring(0, 20) : rawUser;

    // Создаем сообщение
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        main_id: leadId,
        content,
        author_type: safeAuthorType,
        status: messageStatus,
        error_message: errorMessage,
        message_id_tg: telegramMessageId,
        'Created Date': new Date().toISOString(),
        user: safeUser,
        manager_id: req.manager.id
      })
      .select(`
        *,
        sender:managers!manager_id(id, name, email)
      `)
      .single();

    if (messageError) throw messageError;

    // Обновляем last_message_at у контакта
    await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', targetContactId);

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
      io.emit('contact_message', { contact_id: targetContactId, message });
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

    let targetContactId = contactId;
    // Resolve Telegram ID
    const { data: contactResolve } = await supabase.from('contacts').select('id').eq('telegram_user_id', contactId).maybeSingle();
    if (contactResolve) targetContactId = contactResolve.id;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не найден' });
    }

    // 1. Находим активную заявку контакта или создаем новую
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('id, main_id')
      .eq('contact_id', targetContactId)
      .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let orderId = activeOrder?.id;
    let leadId = activeOrder?.main_id;

    if (!orderId) {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: parseInt(targetContactId),
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
    const { data: contact } = await supabase.from('contacts').select('telegram_user_id').eq('id', targetContactId).single();

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
    await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', targetContactId);

    // Socket Emit
    const io = req.app.get('io');
    if (io) {
      if (leadId) io.to(`lead_${leadId}`).emit('new_message', message);
      io.to(`order_${orderId}`).emit('new_message', message);
      io.emit('contact_message', { contact_id: targetContactId, message });
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

    let targetContactId = contactId;
    // Resolve Telegram ID
    const { data: contactResolve } = await supabase.from('contacts').select('id').eq('telegram_user_id', contactId).maybeSingle();
    if (contactResolve) targetContactId = contactResolve.id;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не найден' });
    }

    // 1. Находим активную заявку контакта или создаем новую
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('id, main_id')
      .eq('contact_id', targetContactId)
      .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let orderId = activeOrder?.id;
    let leadId = activeOrder?.main_id;

    if (!orderId) {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: parseInt(targetContactId),
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

    await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, { contentType });

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

    // 3. Send to Telegram
    let telegramMessageId = null;
    const { data: contact } = await supabase.from('contacts').select('telegram_user_id').eq('id', targetContactId).single();

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

// Добавить реакцию к сообщению
router.post('/:id/reactions', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;

    // 1. Получаем текущие реакции и message_id_tg
    console.log('[Reaction] Request for msg:', id, 'emoji:', emoji);
    const { data: message, error: fetchError } = await supabase
      .from('messages')
      .select('id, reactions, main_id, message_id_tg')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[Reaction] Fetch error:', fetchError);
      throw fetchError;
    }
    console.log('[Reaction] Fetched message:', message);

    // 2. Добавляем или обновляем реакцию (Single reaction per manager)
    const currentReactions = message.reactions || [];
    const myExistingReactionIndex = currentReactions.findIndex(r => r.author_id === req.manager.id);

    let updatedReactions = [...currentReactions];

    if (myExistingReactionIndex >= 0) {
      const existingEmoji = currentReactions[myExistingReactionIndex].emoji;

      // Remove old reaction first
      updatedReactions.splice(myExistingReactionIndex, 1);

      // If the clicked emoji is different, add the new one. 
      // If it's the same, we simply removed it (toggle off).
      if (existingEmoji !== emoji) {
        updatedReactions.push({
          emoji,
          author: req.manager.name,
          author_id: req.manager.id,
          created_at: new Date().toISOString()
        });
        console.log('[Reaction] Replaced existing reaction');
      } else {
        console.log('[Reaction] Removed existing reaction (toggle off)');
      }
    } else {
      // No reaction from me yet, just add
      updatedReactions.push({
        emoji,
        author: req.manager.name,
        author_id: req.manager.id,
        created_at: new Date().toISOString()
      });
      console.log('[Reaction] Added new reaction');
    }

    // 3. Обновляем БД (без select)
    const { error: updateError } = await supabase
      .from('messages')
      .update({ reactions: updatedReactions })
      .eq('id', id);

    if (updateError) {
      console.error('[Reaction] Update error:', updateError);
      throw updateError;
    }

    // 4. Получаем свежее сообщение для гарантии целостности
    const { data: updatedMessage, error: fetchFreshError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchFreshError || !updatedMessage) {
      throw fetchFreshError || new Error('Failed to fetch updated message');
    }

    // Safety fallback: if fresh content is missing/null, restore original
    if (!updatedMessage.content && message.content) {
      console.warn(`[Reaction] Content missing in fresh fetch! Restoring original for msg ${id}`);
      updatedMessage.content = message.content;
    }


    // 5. Отправляем реакцию в Telegram
    // NOTE: Telegram Bots can only have ONE active reaction per message.
    // We cannot display "User A liked, User B hearted". The Bot acts as one user.
    // Strategy: We sync the LATEST persistent reaction to Telegram.
    if (updatedMessage.message_id_tg && process.env.TELEGRAM_BOT_TOKEN) {
      console.log('[Reaction] Attempting to send to TG. MsgId:', updatedMessage.message_id_tg, 'MainId:', updatedMessage.main_id);
      try {
        let telegramUserId = null;

        // Strategy 1: Find via main_id (Orders)
        if (updatedMessage.main_id) {
          const { data: orderData } = await supabase
            .from('orders')
            .select('contact_id')
            .eq('main_id', updatedMessage.main_id)
            .limit(1)
            .single();

          if (orderData?.contact_id) {
            const { data: contactData } = await supabase
              .from('contacts')
              .select('telegram_user_id')
              .eq('id', orderData.contact_id)
              .single();
            telegramUserId = contactData?.telegram_user_id;
          }
        }

        // Strategy 2: Find via order_messages junction (if Strategy 1 failed)
        if (!telegramUserId) {
          console.log('[Reaction] Strategy 1 failed, trying Strategy 2 (order_messages)...');
          const { data: orderMsgData } = await supabase
            .from('order_messages')
            .select('order_id')
            .eq('message_id', id)
            .limit(1)
            .single();

          if (orderMsgData?.order_id) {
            const { data: orderData } = await supabase
              .from('orders')
              .select('contact_id')
              .eq('id', orderMsgData.order_id)
              .single();

            if (orderData?.contact_id) {
              const { data: contactData } = await supabase
                .from('contacts')
                .select('telegram_user_id')
                .eq('id', orderData.contact_id)
                .single();
              telegramUserId = contactData?.telegram_user_id;
            }
          }
        }

        console.log('[Reaction] Final TG User ID:', telegramUserId);

        if (telegramUserId) {
          try {
            // Send only the current user's reaction to Telegram (since we enforced single reaction for this user)
            // If we deleted the reaction (updatedReactions excludes it), we send empty array?
            // Wait, if we want to sync the state "Manager likes this", we just send that.
            // But if there are other reactions (from client), we shouldn't wipe them?
            // Actually, `setMessageReaction` from a Bot sets the reaction FROM THE BOT.
            // It does not affect reactions from other users (like the client).
            // So we just need to send the reaction we just saved for the manager (Bot).

            const myReaction = updatedReactions.find(r => r.author_id === req.manager.id);
            const reactionPayload = myReaction ? [{ type: 'emoji', emoji: myReaction.emoji }] : [];

            // NOTE: This call sets the BOT's reaction. It won't touch Client's reaction.
            const tgRes = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setMessageReaction`, {
              chat_id: telegramUserId,
              message_id: updatedMessage.message_id_tg,
              reaction: reactionPayload
            });
            console.log('[Reaction] TG Response success:', tgRes.data?.ok);
          } catch (axiosError) {
            console.error('[Reaction] TG Request Error:', axiosError.response?.data || axiosError.message);
          }
        } else {
          console.log('[Reaction] No TG User ID found after all strategies');
        }
      } catch (tgError) {
        console.error('[Reaction] General Error sending to TG:', tgError.message);
        if (tgError.response) {
          console.error('[Reaction] TG Response Data:', JSON.stringify(tgError.response.data, null, 2));
          console.error('[Reaction] TG Response Status:', tgError.response.status);
        }
      }
    } else {
      console.log('[Reaction] Skip TG. Conditions not met:');
      console.log('- has message_id_tg:', !!updatedMessage.message_id_tg);
      console.log('- has BOT_TOKEN:', !!process.env.TELEGRAM_BOT_TOKEN);
    }

    // 6. Socket Emit
    const io = req.app.get('io');
    if (io) {
      if (updatedMessage.main_id) {
        console.log('[Reaction] Emitting socket to lead_', updatedMessage.main_id);
        io.to(`lead_${updatedMessage.main_id}`).emit('message_updated', updatedMessage);
      }
      // Also emit to order room if needed? Usually lead room is enough if configured.
      // But let's check legacy rooms.
      // The frontend joins lead_XXX.
    }

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
