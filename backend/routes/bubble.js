const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { runAutomations } = require('../services/automationRunner');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware для проверки секретного токена
const verifyWebhookToken = (req, res, next) => {
  const token = req.headers['x-webhook-token'] || req.headers['authorization']?.replace('Bearer ', '');
  const expectedToken = process.env.BUBBLE_WEBHOOK_SECRET;

  if (!expectedToken) {
    console.error('[Bubble Webhook] BUBBLE_WEBHOOK_SECRET не установлен в переменных окружения');
    return res.status(500).json({
      success: false,
      error: 'Webhook secret not configured'
    });
  }

  if (!token || token !== expectedToken) {
    console.warn(`[Bubble Webhook] Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid webhook token'
    });
  }

  next();
};

// Middleware для логирования
router.use((req, res, next) => {
  console.log(`[Bubble Webhook] ${req.method} ${req.path}`, {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    hasToken: !!(req.headers['x-webhook-token'] || req.headers['authorization'])
  });
  next();
});

// Тестовый endpoint для проверки (без токена, только для диагностики)
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Bubble webhook endpoint is working',
    endpoints: {
      chat: 'POST /api/webhook/bubble/chat',
      message: 'POST /api/webhook/bubble/message',
      updateChat: 'PATCH /api/webhook/bubble/chat/:id',
      updateMessage: 'PATCH /api/webhook/bubble/message/:id'
    },
    note: 'All POST/PATCH endpoints require X-Webhook-Token header'
  });
});

// Webhook для создания чата из Bubble
router.post('/chat', verifyWebhookToken, async (req, res) => {
  try {
    const {
      status,
      'Created Date': createdDate,
      AMOid_new,
      lead_id,
      client,
      chat_id,
      amojo_id_client,
      talk_id,
      'Modified Date': modifiedDate,
      'Created By': createdBy,
    } = req.body;

    // Нормализация и подготовка данных для вставки
    const chatData = {
      status: (status || 'new').toLowerCase(),
      'Created Date': createdDate || new Date().toISOString(),
      AMOid_new: AMOid_new ? parseInt(AMOid_new) : null,
      lead_id: lead_id ? String(lead_id).trim() : null,
      client: client ? String(client).trim() : null,
      chat_id: chat_id ? String(chat_id).trim() : null,
      amojo_id_client: amojo_id_client ? String(amojo_id_client).trim() : null,
      talk_id: talk_id ? String(talk_id).trim() : null,
      'Modified Date': modifiedDate || new Date().toISOString(),
      'Created By': createdBy || null,
    };

    // Проверяем, существует ли уже чат с таким chat_id или lead_id
    let existingChat = null;
    if (chat_id) {
      const { data: chatByChatId } = await supabase
        .from('chats')
        .select('id')
        .eq('chat_id', chat_id)
        .maybeSingle();
      existingChat = chatByChatId;
    }

    if (!existingChat && lead_id) {
      const { data: chatByLeadId } = await supabase
        .from('chats')
        .select('id')
        .eq('lead_id', lead_id)
        .maybeSingle();
      existingChat = chatByLeadId;
    }

    let result;
    if (existingChat) {
      // Обновляем существующий чат
      const { data, error } = await supabase
        .from('chats')
        .update(chatData)
        .eq('id', existingChat.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Создаем новый чат
      const { data, error } = await supabase
        .from('chats')
        .insert(chatData)
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Отправляем Socket.IO событие о новом чате
      const io = req.app.get('io');
      if (io) {
        io.emit('new_chat', result);
      }

      // Запускаем автоматизации для нового чата
      runAutomations('chat_created', result, { io }).catch(err => {
        console.error('Error running automations for chat_created:', err);
      });
    }

    console.log(`[Bubble Webhook] Chat ${existingChat ? 'updated' : 'created'}:`, result.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating/updating chat from Bubble:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      details: error.details || null
    });
  }
});

// Webhook для создания сообщения из Bubble
router.post('/message', verifyWebhookToken, async (req, res) => {
  try {
    const {
      lead_id,
      content,
      'Created Date': createdDate,
      author_type,
      message_type,
      message_id_tg,
      timestamp,
      'Modified Date': modifiedDate,
      'Created By': createdBy,
      author_amojo_id,
      message_id_amo,
      user,
      reply_to_mess_id_tg,
      caption,
      conversation_id,
      order_status,
    } = req.body;

    // Валидация обязательных полей
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'content is required and must be a non-empty string'
      });
    }

    // Валидация author_type - принимаем значения из Bubble как есть
    const allowedAuthorTypes = ['Админ', 'Менеджер', 'Оператор', 'Служба заботы', 'Бот', 'Клиент'];

    if (!author_type || typeof author_type !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'author_type is required and must be a string',
        received: author_type
      });
    }

    // Нормализуем (trim, но сохраняем регистр для точного соответствия)
    const normalizedAuthorType = author_type.trim();

    if (!allowedAuthorTypes.includes(normalizedAuthorType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid author_type: "${author_type}". Allowed values: ${allowedAuthorTypes.join(', ')}`,
        received: author_type,
        normalized: normalizedAuthorType
      });
    }

    // Нормализация и подготовка данных для вставки
    const messageData = {
      lead_id: lead_id ? String(lead_id).trim() : null,
      content: content.trim(),
      'Created Date': createdDate || new Date().toISOString(),
      author_type: normalizedAuthorType,
      message_type: (message_type || 'text').toLowerCase(),
      message_id_tg: message_id_tg || null,
      timestamp: timestamp || null,
      'Modified Date': modifiedDate || new Date().toISOString(),
      'Created By': createdBy || null,
      author_amojo_id: author_amojo_id || null,
      message_id_amo: message_id_amo || null,
      user: user || null,
      reply_to_mess_id_tg: reply_to_mess_id_tg || null,
      caption: caption || null,
      conversation_id: conversation_id || null,
      order_status: order_status || null,
    };

    // Проверяем, существует ли уже сообщение с таким message_id_amo или message_id_tg
    let existingMessage = null;
    if (message_id_amo) {
      const { data: msgByAmo } = await supabase
        .from('messages')
        .select('id')
        .eq('message_id_amo', message_id_amo)
        .maybeSingle();
      existingMessage = msgByAmo;
    }

    if (!existingMessage && message_id_tg) {
      const { data: msgByTg } = await supabase
        .from('messages')
        .select('id')
        .eq('message_id_tg', message_id_tg)
        .maybeSingle();
      existingMessage = msgByTg;
    }

    let result;
    if (existingMessage) {
      // Обновляем существующее сообщение
      const { data, error } = await supabase
        .from('messages')
        .update(messageData)
        .eq('id', existingMessage.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Создаем новое сообщение
      const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Отправляем Socket.IO событие о новом сообщении
      const io = req.app.get('io');
      if (io) {
        if (lead_id) {
          io.to(`lead_${lead_id}`).emit('new_message', result);
        }
        io.emit('new_message_bubble', result);
      }

      // Запускаем автоматизации для нового сообщения
      runAutomations('message_received', result, { io }).catch(err => {
        console.error('Error running automations for message_received:', err);
      });
    }

    console.log(`[Bubble Webhook] Message ${existingMessage ? 'updated' : 'created'}:`, result.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating/updating message from Bubble:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      details: error.details || null
    });
  }
});

// Webhook для обновления чата из Bubble
router.patch('/chat/:id', verifyWebhookToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Удаляем id из данных обновления, если он там есть
    delete updateData.id;

    const { data, error } = await supabase
      .from('chats')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Отправляем Socket.IO событие об обновлении чата
    const io = req.app.get('io');
    if (io) {
      io.emit('chat_updated', data);
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error updating chat from Bubble:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook для обновления сообщения из Bubble
router.patch('/message/:id', verifyWebhookToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Удаляем id из данных обновления, если он там есть
    delete updateData.id;

    const { data, error } = await supabase
      .from('messages')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Отправляем Socket.IO событие об обновлении сообщения
    const io = req.app.get('io');
    if (io) {
      if (data.lead_id) {
        io.to(`lead_${data.lead_id}`).emit('message_updated', data);
      }
      io.emit('message_updated_bubble', data);
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error updating message from Bubble:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook для создания сделки (order) из Bubble
router.post('/order', verifyWebhookToken, async (req, res) => {
  try {
    const data = req.body;

    // 1. Contact Resolution (Strict TG ID)
    let contactId = null;
    let telegramId = data.telegram_user_id;

    // Parse tg_amo if provided and telegram_user_id is missing
    if (!telegramId && data.tg_amo && data.tg_amo.includes('ID:')) {
      const match = data.tg_amo.match(/ID:\s*(\d+)/);
      if (match) telegramId = match[1];
    }

    if (telegramId) {
      const { data: c } = await supabase.from('contacts').select('id').eq('telegram_user_id', telegramId).maybeSingle();
      if (c) contactId = c.id;
    }

    // Create Contact if missing
    if (!contactId) {
      // Ignore invalid phone "123"
      let validPhone = (data.client_phone && data.client_phone !== '123' && data.client_phone.length > 5) ? data.client_phone : null;

      const name = data.client_name || (data.tg_amo ? data.tg_amo.split(',')[0] : `User ${telegramId || 'Unknown'}`);

      const { data: newContact, error: ce } = await supabase.from('contacts').insert({
        name: name,
        phone: validPhone,
        telegram_user_id: telegramId || null,
        status: 'active'
      }).select().single();

      if (!ce && newContact) {
        contactId = newContact.id;
        console.log(`[Bubble Webhook] Created new contact: ${name} (TG: ${telegramId})`);
      } else {
        console.error('[Bubble Webhook] Error creating contact:', ce);
      }
    }

    // 2. Prepare Deal Data
    // Map incoming JSON to DB columns. allowing snake_case direct mapping for new columns.
    const dealData = {
      contact_id: contactId,
      external_id: data.external_id || data.order_id || null, // Bubble ID
      title: data.title || `Order from Bubble ${data.order_id || ''}`,
      status: data.status || 'new',
      created_at: data.created_at || new Date().toISOString(),
      description: data.description || data.comment || null,

      // New Fields (expecting snake_case from Bubble, or mapping common ones)
      city_1: data.city_1 || data.city_rus_01,
      city_2: data.city_2 || data.city_esp_02 || data.city,
      currency_give: data.currency_give || data.CurrPair1,
      currency_get: data.currency_get || data.CurrPair2,
      amount_give: data.amount_give || data.SumInput,
      amount_get: data.amount_get || data.SumOutput,
      bank_1: data.bank_1 || data.BankRus01,
      bank_2: data.bank_2 || data.BankRus02,
      atm: data.atm || data.ATM,
      attached_check: data.attached_check || data.AttachedCheck,
      delivery_time: data.delivery_time,
      is_paid: data.is_paid,
      client_phone: data.client_phone,
      telegram_amo_id: data.tg_amo || data.telegram_amo_id,
      amount_partly_paid: data.amount_partly_paid,
      order_date: data.order_date,
      external_creator_id: data.external_creator_id,
      external_user_id: data.external_user_id,
      label_color: data.label_color,
      location_url: data.location_url,
      location_url_alt: data.location_url_alt,
      is_remote: data.is_remote,
      delivery_day_type: data.delivery_day_type,
      mongo_id: data.mongo_id,
      external_updated_at: data.external_updated_at,
      cashback_usdt: data.cashback_usdt,
      cashback_eur: data.cashback_eur,
      order_time_type: data.order_time_type,
      is_first_order: data.is_first_order,
      sum_equivalent_eur: data.sum_equivalent_eur,
      loyalty_points: data.loyalty_points,
      crypto_wallet: data.crypto_wallet,
      message_iban: data.message_iban,
      payee_name: data.payee_name,
      network_usdt_1: data.network_usdt_1,
      network_usdt_2: data.network_usdt_2
    };

    // 3. Insert Deal
    const { data: newDeal, error } = await supabase
      .from('deals')
      .insert(dealData)
      .select()
      .single();

    if (error) throw error;

    // 4. Events & Automations
    const io = req.app.get('io');
    if (io) {
      io.emit('new_deal', newDeal);
    }

    // Automation trigger
    runAutomations('deal_created', newDeal, { io }).catch(err => {
      console.error('Error running automations for deal_created:', err);
    });

    console.log(`[Bubble Webhook] Created deal ${newDeal.id} (External: ${dealData.external_id})`);
    res.json({ success: true, data: newDeal });

  } catch (error) {
    console.error('Error creating deal from Bubble:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

