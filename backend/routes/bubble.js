const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { runAutomations } = require('../services/automationRunner');
const { mapStatus } = require('../utils/statusMapping');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
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

// Тестовый endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Bubble webhook endpoint is working (Refactored: Orders Only)',
    endpoints: {
      message: 'POST /api/webhook/bubble/message',
      order: 'POST /api/webhook/bubble/order',
      updateMessage: 'PATCH /api/webhook/bubble/message/:id'
    },
    note: 'All POST/PATCH endpoints require X-Webhook-Token header'
  });
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
      order_status,
      main_ID, // Main linking key
      telegram_user_id, // Added for fallback resolution
    } = req.body;

    // --- Fallback Logic for missing main_ID ---
    let finalMainId = main_ID;
    let finalContactId = null;

    if (!finalMainId && telegram_user_id) {
      console.log(`[Bubble Webhook] main_ID missing, attempting resolution for TG ID: ${telegram_user_id}`);

      // 1. Find Contact
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, name')
        .eq('telegram_user_id', String(telegram_user_id))
        .maybeSingle();

      if (contact) {
        finalContactId = contact.id;

        // 2. Find Latest Active Order
        const terminalStatuses = ['completed', 'scammer', 'client_rejected', 'lost'];
        const { data: activeOrder } = await supabase
          .from('orders')
          .select('id, main_id')
          .eq('contact_id', contact.id)
          .not('status', 'in', `(${terminalStatuses.join(',')})`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeOrder && activeOrder.main_id) {
          finalMainId = activeOrder.main_id;
          console.log(`[Bubble Webhook] Found active order ${activeOrder.id} with main_id ${finalMainId}`);
        } else {
          // 3. Create New Order (Fallback)
          const newMainId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
          const { data: newOrder, error: createOrderError } = await supabase
            .from('orders')
            .insert({
              contact_id: contact.id,
              title: `Заявка от ${contact.name || 'Unknown'} (Bubble Msg)`,
              amount: 0,
              currency: 'RUB',
              status: 'unsorted',
              type: 'inquiry', // New field: message-only order
              source: 'bubble_webhook_msg',
              description: 'Автоматически созданная заявка из сообщения Bubble (нет активной)',
              created_at: new Date().toISOString(),
              main_id: newMainId
            })
            .select()
            .single();

          if (!createOrderError && newOrder) {
            finalMainId = newMainId;
            console.log(`[Bubble Webhook] Created new fallback order ${newOrder.id} with main_id ${finalMainId}`);

            // Optional: Emit event for new order if needed, similar to bot.js
            const io = req.app.get('io');
            if (io) io.emit('new_order', newOrder);
          } else {
            console.error('[Bubble Webhook] Failed to create fallback order:', createOrderError);
          }
        }
      } else {
        console.warn(`[Bubble Webhook] Contact not found for TG ID: ${telegram_user_id}, cannot resolve main_ID`);
      }
    }
    // ------------------------------------------

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'content is required and must be a non-empty string'
      });
    }

    const allowedAuthorTypes = ['Админ', 'Менеджер', 'Оператор', 'Служба заботы', 'Бот', 'Клиент'];

    if (!author_type || typeof author_type !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'author_type is required',
        received: author_type
      });
    }

    const normalizedAuthorType = author_type.trim();

    if (!allowedAuthorTypes.includes(normalizedAuthorType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid author_type`,
        received: author_type
      });
    }

    // Нормализация и подготовка данных для вставки
    const messageData = {
      lead_id: lead_id ? String(lead_id).trim() : (finalMainId ? String(finalMainId).trim() : null),
      main_id: finalMainId ? String(finalMainId).trim() : null,
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
      order_status: order_status || null,
    };

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
      const { data, error } = await supabase
        .from('messages')
        .update(messageData)
        .eq('id', existingMessage.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (error) throw error;
      result = data;

      const io = req.app.get('io');
      if (io) {
        if (lead_id) {
          io.to(`lead_${lead_id}`).emit('new_message', result);
        }
        io.emit('new_message_bubble', result);
      }

      runAutomations('message_received', result, { io }).catch(err => {
        console.error('Error running automations for message_received:', err);
      });
    }

    // Обновляем last_message_at у контакта (если нашли его ранее)
    if (finalContactId) {
      await supabase
        .from('contacts')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', finalContactId);
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

// Webhook для обновления сообщения из Bubble
router.patch('/message/:id', verifyWebhookToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    delete updateData.id;

    const { data, error } = await supabase
      .from('messages')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

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

// Webhook для создания заявки (order) из Bubble
router.post('/order', verifyWebhookToken, async (req, res) => {
  try {
    let data = req.body;

    if (data.response && data.response.results && Array.isArray(data.response.results) && data.response.results.length > 0) {
      console.log('[Bubble Webhook] Unwrapping nested Bubble payload');
      data = data.response.results[0];
    }

    // 1. Contact Resolution (Strict TG ID)
    let contactId = null;
    let telegramId = data.telegram_user_id;

    if (!telegramId && data.tg_amo && data.tg_amo.includes('ID:')) {
      const match = data.tg_amo.match(/ID:\s*(\d+)/);
      if (match) telegramId = match[1];
    }

    if (telegramId) {
      const { data: c } = await supabase.from('contacts').select('id').eq('telegram_user_id', telegramId).maybeSingle();
      if (c) contactId = c.id;
    }

    if (!contactId) {
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

    // 2. Prepare Order Data
    const orderData = {
      contact_id: contactId,
      external_id: data.external_id || data.order_id || data._id || data.ID || null, // Bubble ID with fallbacks
      main_id: data.main_ID || null,
      title: data.title || `Order from Bubble ${data.order_id || data.ID || ''}`,
      type: 'exchange', // Full order with details
      status: mapStatus(data.status || data.OrderStatus),
      created_at: data.created_at || new Date().toISOString(),
      description: data.description || data.comment || null,

      // New Fields
      city_1: data.city_1 || data.CityRus01,
      city_2: data.city_2 || data.CityEsp02 || data.city,
      currency_give: data.currency_give || data.CurrPair1,
      currency_get: data.currency_get || data.CurrPair2,
      amount_give: data.amount_give || data.SumInput,
      amount_get: data.amount_get || data.SumOutput,
      bank_1: data.bank_1 || data.BankRus01,
      bank_2: data.bank_2 || data.BankRus02,
      atm: data.atm || data.ATM,
      attached_check: data.attached_check || data.AttachedCheck,
      delivery_time: data.delivery_time || data.DeliveryTime,
      is_paid: data.is_paid || data['OrderPaid?'],
      client_phone: data.client_phone || data.MobilePhone,
      telegram_amo_id: data.tg_amo || data.telegram_amo_id,
      amount_partly_paid: data.amount_partly_paid || data.SumPartly,
      order_date: data.order_date || data.date,
      external_creator_id: data.external_creator_id || data['Created By'],
      external_user_id: data.external_user_id || data.User,
      label_color: data.label_color || data.color,
      location_url: data.location_url || data.Location2,
      location_url_alt: data.location_url_alt || data.Location1,
      is_remote: data.is_remote ?? data['Remote?'],
      delivery_day_type: data.delivery_day_type || data.NextDay,
      mongo_id: data.mongo_id || data._id || data.ID,
      external_updated_at: data.external_updated_at || data['Modified Date'],
      cashback_usdt: data.cashback_usdt,
      cashback_eur: data.cashback_eur,
      order_time_type: data.order_time_type,
      is_first_order: data.is_first_order,
      sum_equivalent_eur: data.sum_equivalent_eur,
      loyalty_points: data.loyalty_points,
      crypto_wallet: data.crypto_wallet,
      message_iban: data.message_iban || data.СlientIBAN,
      payee_name: data.payee_name || data.PayeeName,
      payment_timing: data.payment_timing || data['PayNow?'],
      network_usdt_1: data.network_usdt_1 || data.NetworkUSDT01,
      network_usdt_2: data.network_usdt_2
    };

    // 3. Insert Order
    const { data: newOrder, error } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (error) throw error;

    // 4. Events & Automations
    const io = req.app.get('io');
    if (io) {
      io.emit('new_order', newOrder);
    }

    runAutomations('order_created', newOrder, { io }).catch(err => {
      console.error('Error running automations for order_created:', err);
    });

    console.log(`[Bubble Webhook] Created order ${newOrder.id} (External: ${orderData.external_id})`);
    res.json({ success: true, data: newOrder });

  } catch (error) {
    console.error('Error creating order from Bubble:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
