const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { runAutomations } = require('../services/automationRunner');
const { mapStatus } = require('../utils/statusMapping');
const { uploadAvatarFromUrl, rehostFile } = require('../utils/storage');
const { notifyErrorSubscribers } = require('../utils/notifyError');

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
    message: 'Bubble webhook endpoint is working',
    endpoints: {
      message: 'POST /api/webhook/bubble/message',
      order: 'POST /api/webhook/bubble/order',
      contact: 'POST /api/webhook/bubble/contact',
      updateMessage: 'PATCH /api/webhook/bubble/message/:id',
      noteToUser: 'POST /api/webhook/bubble/note_to_user',
      noteToOrder: 'POST /api/webhook/bubble/note_to_order'
    },
    note: 'All POST/PATCH endpoints require X-Webhook-Token header'
  });
});

// Webhook для создания сообщения из Bubble
router.post('/message', verifyWebhookToken, async (req, res) => {
  try {
    console.log('[Bubble Webhook] POST /message - Payload Keys:', Object.keys(req.body));
    console.log('[Bubble Webhook] POST /message - Full Body:', JSON.stringify(req.body, null, 2));

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
      main_ID,
      telegram_user_id,
      reactions,
      file_url,
      file_name
    } = req.body;

    const sanitizeNumeric = (val) => {
      if (!val) return null;
      // Преобразуем в число с плавающей точкой
      const num = parseFloat(val);
      if (isNaN(num)) return null;
      // Возвращаем как строку, сохраняя дробную часть
      return String(num);
    };

    const cleanNull = (val) => {
      if (val == null || val === 'null') return null;
      const str = String(val).trim();
      return str === 'null' || str === '' ? null : str;
    };

    const finalMainId = sanitizeNumeric(main_ID);
    const processedContent = cleanNull(content); // Renamed from finalContent
    const finalFileUrl = cleanNull(file_url);
    const finalFileName = cleanNull(file_name);
    const finalReactions = reactions;
    let finalOrderId = null;
    let finalContactId = null;
    let orderStatusFromDb = null;

    console.log('[Bubble Webhook] Processed Content:', processedContent); // Debug log

    let normalizedAuthorType = 'client';
    if (author_type) {
      const lower = String(author_type).toLowerCase();
      if (lower.includes('manager') || lower.includes('менеджер')) normalizedAuthorType = 'manager';
      else if (lower.includes('client') || lower.includes('клиент')) normalizedAuthorType = 'client';
      else normalizedAuthorType = lower;
    }

    let finalMessageType = message_type || 'text';
    if (finalFileUrl && (!message_type || message_type === 'text')) {
      finalMessageType = 'file';
    }

    if (!finalMainId && telegram_user_id) {
      console.warn('[Bubble] message no main_ID', telegram_user_id);
    }

    // Resolve Contact and Order
    if (finalMainId) {
      const { data: order } = await supabase
        .from('orders')
        .select('id, contact_id')
        .eq('main_id', finalMainId)
        .maybeSingle();

      if (order) {
        finalOrderId = order.id;
        if (order.contact_id) {
          finalContactId = order.contact_id;
        }
      }
    }

    if (!finalContactId && telegram_user_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('telegram_user_id', String(telegram_user_id))
        .maybeSingle();

      if (contact) {
        finalContactId = contact.id;
      }
    }

    const safeContent = (processedContent === 'null' || !processedContent) ? '' : processedContent;

    // AUTO-DETECT FILE LINKS IN CONTENT (Bubble often sends files as links in text field)
    let autoFileUrl = finalFileUrl;
    let autoMessageType = finalMessageType;
    let finalPayloadContent = safeContent;

    const fileRegex = /\.(jpg|jpeg|png|gif|webp|pdf|mp4|webm|mov|ogg|wav)$/i;
    const isPureLink = /^https?:\/\/[^\s]+$/i.test(safeContent.trim());

    if (!autoFileUrl && isPureLink && fileRegex.test(safeContent.trim())) {
      console.log(`[Bubble Webhook] Auto-detected file link in content: ${safeContent}`);
      autoFileUrl = safeContent.trim();
      autoMessageType = 'file';
      // If it's a pure link, we can clear the text content to only show the attachment preview
      finalPayloadContent = '';
    }

    const messageData = {
      lead_id: sanitizeNumeric(lead_id) || (finalMainId ? String(finalMainId).trim() : null),
      main_id: finalMainId,
      content: finalPayloadContent,
      'Created Date': createdDate || new Date().toISOString(),
      author_type: normalizedAuthorType,
      message_type: autoMessageType,
      message_id_tg: sanitizeNumeric(message_id_tg),
      timestamp: cleanNull(timestamp),
      'Modified Date': modifiedDate || new Date().toISOString(),
      'Created By': cleanNull(createdBy),
      author_amojo_id: cleanNull(author_amojo_id),
      message_id_amo: cleanNull(message_id_amo),
      user: cleanNull(user),
      reply_to_mess_id_tg: sanitizeNumeric(reply_to_mess_id_tg),
      caption: cleanNull(caption),
      order_status: order_status || null,
      file_url: autoFileUrl,
      file_name: finalFileName,
      ...(finalReactions !== undefined && { reactions: finalReactions }),
    };

    let existingMessage = null;
    if (message_id_amo && String(message_id_amo) !== 'null') {
      const { data: msgByAmo } = await supabase
        .from('messages')
        .select('id, content, reactions')
        .eq('message_id_amo', message_id_amo)
        .maybeSingle();
      existingMessage = msgByAmo;
    }

    // Only check by TG ID if we haven't found it yet AND it's a valid ID (not 0)
    if (!existingMessage && message_id_tg && String(message_id_tg) !== '0') {
      const { data: msgByTg } = await supabase
        .from('messages')
        .select('id, content, reactions')
        .eq('message_id_tg', message_id_tg)
        .maybeSingle();
      existingMessage = msgByTg;
    }

    // Debug logging for reactions
    if (message_type === 'reaction') {
      console.log(`[Bubble Webhook] REACTION received - AMO ID: ${message_id_amo}, TG ID: ${message_id_tg}, Emoji: ${content}`);
      console.log(`[Bubble Webhook] REACTION - Existing message found: ${!!existingMessage}, ID: ${existingMessage?.id}`);
    }

    let result;
    if (existingMessage) {
      const payloadToUpdate = { ...messageData };

      // Handle "reaction" type updates from Bubble
      if (message_type === 'reaction') {
        console.log(`[Bubble Webhook] Processing REACTION update for msg ${existingMessage.id}. Emoji: ${content}`);

        const currentReactions = existingMessage.reactions || [];
        const newReaction = {
          emoji: content, // Content holds the emoji
          author: 'Client',
          created_at: new Date().toISOString()
        };

        // Update reactions list
        const updatedReactions = [...currentReactions, newReaction];

        // CRITICAL: Only update reactions field, don't touch anything else!
        // If we use payloadToUpdate with all fields, author_type will be overwritten
        Object.keys(payloadToUpdate).forEach(key => {
          if (key !== 'reactions') {
            delete payloadToUpdate[key];
          }
        });
        payloadToUpdate.reactions = updatedReactions;

        console.log(`[Bubble Webhook] REACTION - Only updating reactions, preserving author_type and all other fields`);

      } else {
        // Standard update: Protect content from accidental erasure if missing in payload
        if (!payloadToUpdate.content && existingMessage.content) {
          console.log(`[Bubble Webhook] Preserving existing content for msg ${existingMessage.id}`);
          delete payloadToUpdate.content;
        }
      }

      const { data, error } = await supabase
        .from('messages')
        .update(payloadToUpdate)
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

      // Link to Order (Fix for message not appearing in Deal)
      if (finalOrderId && result && result.id) {
        await supabase.from('order_messages').insert({
          order_id: finalOrderId,
          message_id: result.id
        }).then(({ error: linkError }) => {
          if (linkError) console.error('[Bubble Webhook] Failed to link message to order:', linkError);
          else console.log(`[Bubble Webhook] Linked message ${result.id} to order ${finalOrderId}`);
        });
      }
    }

    // Socket.IO emissions - OUTSIDE if/else to work for both new messages and updates
    const socketPayload = {
      ...result,
      order_status: order_status || orderStatusFromDb || 'unsorted',
      contact_id: finalContactId,
      main_id: result.main_id || main_ID
    };

    const io = req.app.get('io');
    if (io) {
      if (existingMessage) {
        // It was an UPDATE (e.g. reaction)
        console.log(`[Bubble Webhook] Emitting message_updated for msg ${result.id}`);

        if (finalContactId) {
          io.to(`contact_${finalContactId}`).emit('message_updated', socketPayload);
        }

        // Keep order emission for backward compatibility
        if (finalOrderId) {
          io.to(`order_${finalOrderId}`).emit('message_updated', socketPayload);
        }

        io.emit('message_updated_bubble', socketPayload);
        io.emit('message_updated', socketPayload);
      } else {
        // It was an INSERT
        console.log(`[Bubble Webhook] Emitting new_client_message for msg ${result.id}`);

        if (lead_id) {
          io.to(`lead_${lead_id}`).emit('new_message', socketPayload);
        }

        // IMPORTANT: Emit to contact room - most reliable for cross-order sync
        if (finalContactId) {
          console.log(`[Bubble Webhook] Emitting to contact_${finalContactId}`);
          io.to(`contact_${finalContactId}`).emit('new_client_message', socketPayload);
        }

        // Keep order emission 
        if (finalOrderId) {
          console.log(`[Bubble Webhook] Emitting to order_${finalOrderId}`);
          io.to(`order_${finalOrderId}`).emit('new_client_message', socketPayload);
        }
        io.emit('new_message_bubble', socketPayload);
        // GLOBAL ALERT EMISSION
        io.emit('new_message_global', socketPayload);
      }

      // Required for InboxPage sidebar update (and potentially others)
      if (finalContactId) {
        io.emit('contact_message', {
          contact_id: finalContactId,
          message: result
        });
      }
    }

    // Run automations only for new messages
    if (!existingMessage) {
      runAutomations('message_received', result, { io }).catch(err => {
        console.error('Error running automations for message_received:', err);
      });
    }

    // Обновляем last_message_at у контакта (если нашли его ранее)
    // Don't update time for reactions, as they shouldn't bump conversation
    if (finalContactId && message_type !== 'reaction') {
      const lastActiveTime = createdDate || new Date().toISOString();
      await supabase
        .from('contacts')
        .update({ last_message_at: lastActiveTime })
        .eq('id', finalContactId);
    }

    console.log(`[Bubble Webhook] Message ${existingMessage ? 'updated' : 'created'}:`, result.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating/updating message from Bubble:', error);
    notifyErrorSubscribers(`🔴 Ошибка обработки сообщения из Bubble:\n${error.message}`);
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

    // 1. Contact Resolution (Strict User Field ONLY)
    let contactId = null;
    let telegramId = null;

    console.log('[Bubble Webhook] --- Contact Resolution Start ---');
    console.log('[Bubble Webhook] FULL KEY LIST:', Object.keys(data)); // Added
    console.log('[Bubble Webhook] FULL PAYLOAD:', JSON.stringify(data, null, 2)); // Added
    // Check 'User' or 'bubbleUser' field FIRST (Primary)
    // Payload shows 'bubbleUser' is sometimes used instead of 'User'
    const rawUserValue = data.User || data.bubbleUser;

    console.log('[Bubble Webhook] Raw User value resolved:', rawUserValue);

    if (rawUserValue) {
      const userStr = String(rawUserValue);
      console.log(`[Bubble Webhook] User converted to string: '${userStr}'`);

      // 1. Try stripping non-digits
      const cleanDigits = userStr.replace(/\D/g, '');
      console.log(`[Bubble Webhook] User stripped of non-digits: '${cleanDigits}'`);

      if (cleanDigits.length >= 5) {
        telegramId = cleanDigits;
        console.log(`[Bubble Webhook] ✅ SUCCESS: Identified as direct Telegram ID: ${telegramId}`);
      }
      // 2. If valid digits not found, check if it's a Bubble ID (e.g. alphanumeric with 'x')
      else if (userStr.length > 15 && (userStr.includes('x') || userStr.match(/[a-f]/i))) {
        console.log(`[Bubble Webhook] ⚠️ Pattern suggests Bubble ID (not digits). Fetching details...`);
        try {
          const axios = require('axios');
          const userRes = await axios.get(`https://vega-ex.com/version-live/api/1.1/obj/User/${rawUserValue}`, {
            headers: { Authorization: `Bearer ${process.env.BUBBLE_API_TOKEN || 'b897577858b2a032515db52f77e15e38'}` }
          });

          console.log('[Bubble Webhook] API Response:', JSON.stringify(userRes.data?.response));

          if (userRes.data?.response?.TelegramID) {
            telegramId = userRes.data.response.TelegramID;
            console.log(`[Bubble Webhook] ✅ SUCCESS: Fetched TelegramID from Bubble API: ${telegramId}`);
          } else {
            console.log(`[Bubble Webhook] ❌ FAILURE: Fetched User but field 'TelegramID' is missing.`);
          }
        } catch (e) {
          console.error('[Bubble Webhook] ❌ API REQUEST FAILED:', e.message);
        }
      } else {
        console.log(`[Bubble Webhook] ❌ FAILURE: User value '${userStr}' is neither valid digits nor a fetchable ID.`);
      }
    } else {
      console.log('[Bubble Webhook] ❌ FAILURE: Both data.User and data.bubbleUser are missing or null.');
    }

    console.log('[Bubble Webhook] Final Resolved telegramId:', telegramId);





    // Fallback: Parse from tg_amo string ("Name, ID: 12345")
    if (!telegramId && data.tg_amo && data.tg_amo.includes('ID:')) {
      const match = data.tg_amo.match(/ID:\s*(\d+)/);
      if (match) telegramId = match[1];
    }

    if (telegramId) {
      // Use string comparison for safety
      const { data: c } = await supabase.from('contacts').select('id').eq('telegram_user_id', String(telegramId)).maybeSingle();
      if (c) {
        contactId = c.id;
        console.log(`[Bubble Webhook] Found existing contact ${contactId} for TG ${telegramId}`);
      }
    }

    if (!contactId) {
      let validPhone = (data.client_phone && data.client_phone !== '123' && data.client_phone.length > 5) ? data.client_phone : null;

      // Smart Name Resolution
      let name = data.client_name || null;
      if (!name && data.tg_amo) name = data.tg_amo.split(',')[0];
      if (!name) name = `User ${telegramId || rawUserValue || 'Unknown'}`;

      console.log(`[Bubble Webhook] Creating new contact: ${name} (TG: ${telegramId})`);

      const { data: newContact, error: ce } = await supabase.from('contacts').insert({
        name: name,
        phone: validPhone,
        telegram_user_id: telegramId ? String(telegramId) : null,
        status: 'active'
      }).select().single();

      if (!ce && newContact) {
        contactId = newContact.id;
        console.log(`[Bubble Webhook] Created new contact: ${newContact.id}`);
      } else {
        console.error('[Bubble Webhook] Error creating contact:', ce);
        // Fallback: try to find "User Unknown" contact or create a dummy one?
        // For now, let it be null, but order insertion might fail if contact_id is required
      }
    }

    // Helper to safely parse numeric values from Bubble
    const parseNumeric = (value) => {
      if (value === null || value === undefined || value === 'null' || value === '') return null;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    };

    // Sync outer scope ID for final update
    finalContactId = contactId;

    // 2. Prepare Order Data
    const orderData = {
      contact_id: contactId,
      external_id: data.external_id || data.order_id || data._id || data.ID || null,
      main_id: data.main_ID || null,
      OrderName: data.OrderName || data.title || `Order from Bubble ${data.order_id || data.ID || ''}`,
      type: 'exchange',
      OrderStatus: data.OrderStatus || data.status,
      status: mapStatus(data.status || data.OrderStatus),
      created_at: data.created_at || new Date().toISOString(),
      OrderDate: data.OrderDate || data.date || data.order_date,
      Comment: data.Comment || data.description || data.comment || null,

      // --- Renamed Fields ---
      CurrPair1: data.currPair1 || data.CurrPair1 || data.currency_give,
      CurrPair2: data.currPair2 || data.CurrPair2 || data.currency_get,
      SumInput: parseNumeric(data.sumInput || data.SumInput || data.amount_give),
      SumOutput: parseNumeric(data.sumOutput || data.SumOutput || data.amount_get),
      BankRus01: data.bankRus01 || data.BankRus01 || data.bank_1,
      BankRus02: data.bankRus02 || data.BankRus02 || data.bank_2,
      CityRus01: data.cityRus01 || data.CityRus01 || data.city_1,
      CityEsp02: data.cityEsp02 || data.CityEsp02 || data.city_2,
      DeliveryTime: data.deliveryTime || data.DeliveryTime || data.delivery_time,
      OrderPaid: data.orderPaid || data.OrderPaid || data['OrderPaid?'] || data.is_paid,
      PayNow: data.payNow || data.PayNow || data['PayNow?'] || data.payment_timing,
      Remote: data.remote || data.Remote || data['Remote?'] || data.is_remote,
      NextDay: data.nextDay || data.NextDay || data.delivery_day_type,

      // --- New Fields (Strings) ---
      ATM_Esp: data.atmEsp || data.ATM_Esp,
      BankEsp: data.bankEsp || data.BankEsp,
      Card_NumberOrSBP: data.cardNumberOrSBP || data.Card_NumberOrSBP,
      CityEsp01: data.cityEsp01 || data.CityEsp01,
      CityRus02: data.cityRus02 || data.CityRus02,
      ClientCryptoWallet: data.clientCryptoWallet || data.ClientCryptoWallet,
      ClientIBAN: data.clientIBAN || data.ClientIBAN,
      Location2: data.location2 || data.Location2 || data.location_url,
      MessageIBAN: data.messageIBAN || data.MessageIBAN,
      NetworkUSDT01: data.networkUSDT01 || data.NetworkUSDT01,
      NetworkUSDT02: data.networkUSDT02 || data.NetworkUSDT02,
      Ordertime: data.ordertime || data.Ordertime,
      PayeeName: data.payeeName || data.PayeeName,

      // --- New Fields (Numeric) ---
      CashbackEUR: parseNumeric(data.cashbackEUR || data.CashbackEUR),
      CashbackUSDT: parseNumeric(data.cashbackUSDT || data.CashbackUSDT),
      SumPartly: parseNumeric(data.sumPartly || data.SumPartly || data.amount_partly_paid),

      // --- New Fields (Users/IDs) ---
      BubbleUser: data.bubbleUser || data.BubbleUser || data.User || data.external_user_id,
      lead_id: data.lead_id,

      // Explicit mappings (Legacy/Fallback)
      client_phone: data.mobilePhone || data.client_phone || data.MobilePhone,
      MobilePhone: data.mobilePhone || data.MobilePhone || data.client_phone,

      // Internal fields
      source: 'bubble',
      label_color: data.label_color || data.color,
      mongo_id: data.mongo_id || data._id || data.ID,
      external_updated_at: data.external_updated_at || data['Modified Date'],
      external_creator_id: data.external_creator_id || data['Created By']
    };

    // 3. Insert Order
    const { data: newOrder, error } = await supabase
      .from('orders')
      .insert(orderData)
      .select('*, contact:contacts(name, phone, email)')
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
    notifyErrorSubscribers(`🔴 Ошибка создания заявки из Bubble:\n${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook для создания/обновления контакта из Bubble
router.post('/contact', verifyWebhookToken, async (req, res) => {
  try {
    console.log('[Bubble Webhook] Received contact data:', JSON.stringify(req.body, null, 2));

    let data = req.body;

    // Unwrap nested Bubble payload if needed
    if (data.response && data.response.results && data.response.results.length > 0) {
      console.log('[Bubble Webhook] Unwrapping nested Bubble contact payload');
      data = data.response.results[0];
    }

    // Extract contact fields from Bubble
    const {
      name,
      phone,
      email,
      telegram_user_id,
      tg_amo, // "username, ID: 123456789"
      telegram_username,
      first_name,
      last_name,
      company,
      position,
      address,
      birthday,
      comment,
      status,
      rating,
      manager_id,
      avatar_url,
      photo,
      photo_url,
      profile_picture
    } = data;

    // Resolve Telegram ID from tg_amo if not provided directly
    let telegramId = telegram_user_id;
    if (!telegramId && tg_amo && tg_amo.includes('ID:')) {
      const match = tg_amo.match(/ID:\s*(\d+)/);
      if (match) telegramId = match[1];
    }

    // Validate required fields
    // Relaxed validation: Just warn if everything is missing
    if (!name && !telegramId && !phone) {
      console.warn('[Bubble Webhook] Contact received without name, telegram_user_id, or phone. Proceeding with defaults.');
    }

    // Try to find existing contact
    let existingContact = null;

    // 1. Try by Telegram ID (most reliable)
    if (telegramId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('telegram_user_id', telegramId)
        .maybeSingle();

      if (contact) {
        existingContact = contact;
        console.log(`[Bubble Webhook] Found contact by Telegram ID: ${contact.id}`);
      }
    }

    // 2. Try by phone if not found
    if (!existingContact && phone && phone !== '123' && phone.length > 5) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      if (contact) {
        existingContact = contact;
        console.log(`[Bubble Webhook] Found contact by phone: ${contact.id}`);
      }
    }

    // 3. Try by email if not found
    if (!existingContact && email) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (contact) {
        existingContact = contact;
        console.log(`[Bubble Webhook] Found contact by email: ${contact.id}`);
      }
    }

    // Process Avatar if provided
    let finalAvatarUrl = avatar_url || photo || photo_url || profile_picture || null;

    if (finalAvatarUrl && finalAvatarUrl.startsWith('http')) {
      // Check if it's already a supabase URL to avoid re-uploading loops if logic changes (optional safety)
      if (!finalAvatarUrl.includes('supabase.co')) {
        const uploadedUrl = await uploadAvatarFromUrl(finalAvatarUrl, telegramId ? `tg_${telegramId}` : null);
        if (uploadedUrl) {
          finalAvatarUrl = uploadedUrl;
        }
      }
    }

    // Prepare contact data (only fields that exist in Supabase)
    const contactData = {
      name: name || existingContact?.name || `User ${telegramId || phone || 'Unknown'}`,
      phone: (phone && phone !== '123' && phone.length > 5) ? phone : null,
      email: email || null,
      telegram_user_id: telegramId || null,
      telegram_username: telegram_username || null,
      first_name: first_name || null,
      last_name: last_name || null,
      company: company || null,
      position: position || null,
      address: address || null,
      birthday: birthday || null,
      comment: comment || null,
      status: status || 'active',
      rating: rating ? parseInt(rating) : null,
      manager_id: manager_id ? parseInt(manager_id) : null,
      avatar_url: finalAvatarUrl,
    };

    let result;

    if (existingContact) {
      // Update existing contact
      const { data: updatedContact, error: updateError } = await supabase
        .from('contacts')
        .update(contactData)
        .eq('id', existingContact.id)
        .select()
        .single();

      if (updateError) throw updateError;

      result = updatedContact;
      console.log(`[Bubble Webhook] Updated contact ${result.id}: ${result.name}`);
    } else {
      // Create new contact
      const { data: newContact, error: createError } = await supabase
        .from('contacts')
        .insert(contactData)
        .select()
        .single();

      if (createError) throw createError;

      result = newContact;
      console.log(`[Bubble Webhook] Created new contact ${result.id}: ${result.name}`);
    }

    res.json({
      success: true,
      data: result,
      action: existingContact ? 'updated' : 'created'
    });

  } catch (error) {
    console.error('[Bubble Webhook] Error processing contact:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook для обновления статуса из Bubble
router.post('/status', verifyWebhookToken, async (req, res) => {
  try {
    const { leads } = req.body;

    // Структура: { "leads": { "status": [ { "id": "main_id", "status_id": "..." } ] } }
    if (!leads || !leads.status || !Array.isArray(leads.status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payload structure. Expected { leads: { status: [...] } }'
      });
    }

    const { BUBBLE_ID_TO_STATUS } = require('../utils/bubbleWebhook');
    const updates = [];
    const errors = [];

    // Обрабатываем каждый элемент массива status
    for (const item of leads.status) {
      const mainId = item.id;
      const bubbleStatusId = item.status_id;

      if (!mainId || !bubbleStatusId) {
        errors.push({ item, error: 'Missing id (main_id) or status_id' });
        continue;
      }

      // 1. Маппинг статуса
      const internalStatus = BUBBLE_ID_TO_STATUS[bubbleStatusId];
      if (!internalStatus) {
        console.warn(`[Bubble Webhook Status] Unknown bubble status ID: ${bubbleStatusId} for main_id ${mainId}`);
        errors.push({ item, error: 'Unknown status_id mapping' });
        continue;
      }

      // 2. Поиск заказа по main_id
      const { data: order, error: findError } = await supabase
        .from('orders')
        .select('*')
        .eq('main_id', mainId)
        .maybeSingle();

      if (findError || !order) {
        console.warn(`[Bubble Webhook Status] Order not found for main_id: ${mainId}`);
        errors.push({ item, error: 'Order not found' });
        continue;
      }

      // 3. Если статус тот же, пропускаем
      if (order.status === internalStatus) {
        updates.push({ id: order.id, status: 'skipped (same status)' });
        continue;
      }

      // 4. Обновляем статус
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({ status: internalStatus })
        .eq('id', order.id)
        .select('*, contact:contacts(name, phone, email)')
        .single();

      if (updateError) {
        errors.push({ item, error: updateError.message });
        continue;
      }



      // 5. Запускаем ВНУТРЕННИЕ автоматизации и уведомления
      // ВАЖНО: Мы НЕ вызываем sendBubbleStatusWebhook, чтобы избежать цикла!
      const io = req.app.get('io');

      // Socket.IO для фронтенда
      if (io) {
        io.emit('order_updated', updatedOrder);
      }

      // Внутренние автоматизации (уведомления менеджерам и т.д.)
      runAutomations('order_status_changed', updatedOrder, { io }).catch(err => {
        console.error('Error running automations for order_status_changed (from Bubble webhook):', err);
      });

      updates.push({ id: updatedOrder.id, old_status: order.status, new_status: internalStatus });
      console.log(`[Bubble Webhook Status] Updated order ${updatedOrder.id} status: ${order.status} -> ${internalStatus}`);
    }

    res.json({
      success: true,
      processed: updates.length,
      errors: errors.length > 0 ? errors : undefined,
      updates
    });

  } catch (error) {
    console.error('[Bubble Webhook] Error processing status update:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// VEG-64: Webhook для создания заметки пользователю (во все ордера + в заметки контакта)
router.post('/note_to_user', verifyWebhookToken, async (req, res) => {
  try {
    const { user, note } = req.body;

    console.log('[Bubble Webhook] POST /note_to_user - User:', user, 'Note:', note);

    if (!user || !note) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user, note'
      });
    }

    // 1. Resolve contact by user (try telegram_user_id first, then bubble user id)
    let contactId = null;
    let telegramId = null;

    // Try as direct Telegram ID (numeric)
    const cleanDigits = String(user).replace(/\D/g, '');
    if (cleanDigits.length >= 5) {
      telegramId = cleanDigits;
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('telegram_user_id', telegramId)
        .maybeSingle();

      if (contact) {
        contactId = contact.id;
        console.log(`[Bubble Webhook] Found contact ${contactId} by Telegram ID ${telegramId}`);
      }
    }

    // If not found, try as Bubble User ID
    if (!contactId && String(user).length > 15) {
      try {
        const axios = require('axios');
        const userRes = await axios.get(`https://vega-ex.com/version-live/api/1.1/obj/User/${user}`, {
          headers: { Authorization: `Bearer ${process.env.BUBBLE_API_TOKEN || 'b897577858b2a032515db52f77e15e38'}` }
        });

        if (userRes.data?.response?.TelegramID) {
          telegramId = userRes.data.response.TelegramID;
          const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('telegram_user_id', telegramId)
            .maybeSingle();

          if (contact) {
            contactId = contact.id;
            console.log(`[Bubble Webhook] Found contact ${contactId} via Bubble API`);
          }
        }
      } catch (e) {
        console.error('[Bubble Webhook] Error fetching user from Bubble:', e.message);
      }
    }

    if (!contactId) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found for user: ' + user
      });
    }

    // 2. Get all orders for this contact
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, main_id, OrderName')
      .eq('contact_id', contactId);

    if (ordersError) throw ordersError;

    console.log(`[Bubble Webhook] Found ${orders?.length || 0} orders for contact ${contactId}`);

    // 3. Create system message in internal_messages for EACH order
    const io = req.app.get('io');
    const createdMessages = [];

    // Format timestamp
    const now = new Date();
    const timestamp = now.toLocaleString('ru-RU', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(',', '');

    const systemContent = `📝 Заметка: ${note} ${timestamp}`;

    if (orders && orders.length > 0) {
      for (const order of orders) {
        try {
          const { data: sysMsg, error: sysMsgError } = await supabase
            .from('internal_messages')
            .insert({
              order_id: order.id,
              sender_id: null, // System message, no specific sender
              content: systemContent,
              is_read: false,
              attachment_type: 'system'
            })
            .select()
            .single();

          if (!sysMsgError && sysMsg) {
            createdMessages.push(sysMsg);

            // Emit socket event for this order
            if (io) {
              io.to(`order_${order.id}`).emit('new_internal_message', sysMsg);
            }
          } else {
            console.error(`[Bubble Webhook] Error creating system msg for order ${order.id}:`, sysMsgError);
          }
        } catch (e) {
          console.error(`[Bubble Webhook] Exception creating system msg for order ${order.id}:`, e);
        }
      }
    }

    // 4. Create note in notes table for the contact
    const { data: noteData, error: noteError } = await supabase
      .from('notes')
      .insert({
        contact_id: contactId,
        content: note,
        priority: 'info',
        manager_id: null // System-generated note
      })
      .select()
      .single();

    if (noteError) {
      console.error('[Bubble Webhook] Error creating contact note:', noteError);
    } else {
      console.log(`[Bubble Webhook] Created contact note ${noteData.id}`);
    }

    res.json({
      success: true,
      contact_id: contactId,
      messages_created: createdMessages.length,
      note_created: !!noteData
    });

  } catch (error) {
    console.error('[Bubble Webhook] Error in note_to_user:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// VEG-64: Webhook для создания заметки к конкретному ордеру (только в этот ордер)
router.post('/note_to_order', verifyWebhookToken, async (req, res) => {
  try {
    const { main_id, note } = req.body;

    console.log('[Bubble Webhook] POST /note_to_order - Main ID:', main_id, 'Note:', note);

    if (!main_id || !note) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: main_id, note'
      });
    }

    // 1. Find order by main_id
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, contact_id, OrderName')
      .eq('main_id', main_id)
      .maybeSingle();

    if (orderError) throw orderError;

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found for main_id: ' + main_id
      });
    }

    console.log(`[Bubble Webhook] Found order ${order.id} for main_id ${main_id}`);

    // 2. Create system message ONLY for this specific order
    const now = new Date();
    const timestamp = now.toLocaleString('ru-RU', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(',', '');

    const systemContent = `📝 Заметка: ${note} ${timestamp}`;

    const { data: sysMsg, error: sysMsgError } = await supabase
      .from('internal_messages')
      .insert({
        order_id: order.id,
        sender_id: null, // System message
        content: systemContent,
        is_read: false,
        attachment_type: 'system'
      })
      .select()
      .single();

    if (sysMsgError) throw sysMsgError;

    console.log(`[Bubble Webhook] Created system message ${sysMsg.id} for order ${order.id}`);

    // 3. Emit socket event ONLY for this order
    const io = req.app.get('io');
    if (io) {
      io.to(`order_${order.id}`).emit('new_internal_message', sysMsg);
    }

    res.json({
      success: true,
      order_id: order.id,
      message_id: sysMsg.id
    });

  } catch (error) {
    console.error('[Bubble Webhook] Error in note_to_order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
