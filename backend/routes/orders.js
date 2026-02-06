const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { runAutomations } = require('../services/automationRunner');
const { sendBubbleStatusWebhook } = require('../utils/bubbleWebhook');
const { ordersCache, generateCacheKey, clearCache } = require('../utils/cache');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Получить все заявки (orders)
router.get('/', auth, async (req, res) => {
  try {
    const { contact_id, status, tag_id, limit, offset = 0, minimal } = req.query;

    // Генерируем ключ кэша
    const cacheKey = generateCacheKey('orders', req.query);

    // Проверяем кэш
    const cachedData = ordersCache.get(cacheKey);
    if (cachedData) {
      // console.log(`[Cache] Hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const isMinimal = minimal === 'true';

    let query;

    if (isMinimal) {
      // Минимальный режим для канбан-доски
      query = supabase
        .from('orders')
        .select(`id, contact_id, "OrderName", "SumInput", "CurrPair1", status, created_at, main_id, "CityEsp02", "DeliveryTime", "NextDay", "SumOutput", "CurrPair2", contact:contacts(id, name), manager:managers!deals_manager_id_fkey(id, name)${tag_id ? ', order_tags!inner(tag_id)' : ''}`)
        .order('created_at', { ascending: false });

      // Apply range ONLY if limit is specified
      if (limit) {
        query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      }
    } else {
      // Полный режим
      query = supabase
        .from('orders')
        .select(`
          *,
          contact:contacts(id, name, email, phone),
          manager:managers!deals_manager_id_fkey(id, name)${tag_id ? ', order_tags!inner(tag_id)' : ''}
        `)
        .order('created_at', { ascending: false });

      // Apply range ONLY if limit is specified
      if (limit) {
        query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      }
    }

    if (contact_id) {
      // Always try to resolve Telegram ID first
      const { data: contactResolve } = await supabase
        .from('contacts')
        .select('id')
        .eq('telegram_user_id', contact_id)
        .maybeSingle();

      if (contactResolve) {
        query = query.eq('contact_id', contactResolve.id);
      } else {
        query = query.eq('contact_id', contact_id);
      }
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (tag_id) {
      query = query.eq('order_tags.tag_id', tag_id);
    }

    // NEW FILTERS (VEG-58)
    // Date range filter
    if (req.query.dateFrom) {
      query = query.gte('created_at', req.query.dateFrom);
    }
    if (req.query.dateTo) {
      query = query.lte('created_at', req.query.dateTo);
    }

    // Amount range filter (uses SumInput field)
    if (req.query.amountMin) {
      query = query.gte('SumInput', parseFloat(req.query.amountMin));
    }
    if (req.query.amountMax) {
      query = query.lte('SumInput', parseFloat(req.query.amountMax));
    }

    // Currency filter
    if (req.query.currency) {
      query = query.eq('CurrPair1', req.query.currency);
    }

    // Source filter (array support)
    if (req.query.sources) {
      const sources = Array.isArray(req.query.sources)
        ? req.query.sources
        : req.query.sources.split(',');
      query = query.in('source', sources);
    }

    // Closed by manager filter
    if (req.query.closedBy) {
      query = query.eq('closed_by_manager_id', parseInt(req.query.closedBy));
    }

    // Statuses array filter (overrides single status)
    if (req.query.statuses) {
      const statuses = Array.isArray(req.query.statuses)
        ? req.query.statuses
        : req.query.statuses.split(',');
      query = query.in('status', statuses);
    }

    // Output amount range filter (SumOutput)
    if (req.query.amountOutputMin) {
      query = query.gte('SumOutput', parseFloat(req.query.amountOutputMin));
    }
    if (req.query.amountOutputMax) {
      query = query.lte('SumOutput', parseFloat(req.query.amountOutputMax));
    }

    // Output currency filter (CurrPair2)
    if (req.query.currencyOutput) {
      query = query.eq('CurrPair2', req.query.currencyOutput);
    }

    // Location filter (CityEsp02)
    if (req.query.location) {
      query = query.ilike('CityEsp02', `%${req.query.location}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Filter by tags if provided (many-to-many relationship) - BEFORE mapping
    let filteredData = data;
    if (req.query.tags) {
      const tagsFilter = Array.isArray(req.query.tags)
        ? req.query.tags.map(t => parseInt(t))
        : req.query.tags.split(',').map(t => parseInt(t));

      // Get order IDs that have ANY of the selected tags
      const { data: orderTagsData } = await supabase
        .from('order_tags')
        .select('order_id')
        .in('tag_id', tagsFilter);

      const orderIdsWithTags = new Set(orderTagsData?.map(ot => ot.order_id) || []);
      filteredData = data.filter(order => orderIdsWithTags.has(order.id));
    }

    // Преобразуем amount (из строки в число)
    let orders = filteredData.map(order => ({
      ...order,
      title: order.OrderName,
      amount: parseFloat(order.SumInput) || 0,
      currency: order.CurrPair1 || 'RUB',
      description: order.Comment
    }));

    // Для минимального режима (Канбан) подгружаем последние сообщения клиентов
    // Для минимального режима (Канбан) подгружаем последние сообщения клиентов
    if (isMinimal && orders.length > 0) {
      try {
        const mainIds = orders
          .map(o => o.main_id)
          .filter(id => id); // Filter out null/undefined

        if (mainIds.length > 0) {
          // OPTIMIZATION: Fetch from Views instead of raw table
          // 1. Get Latest Message Content (1 row per order)
          // 2. Get Unread Counts (1 row per order)

          const [latestMsgResult, unreadCountResult] = await Promise.all([
            supabase
              .rpc('get_latest_messages', {
                target_main_ids: mainIds.map(String),
                only_client: true
              }),
            supabase
              .rpc('get_unread_client_counts', {
                target_main_ids: mainIds.map(String)
              })
          ]);

          const latestMessages = latestMsgResult.data || [];
          const unreadCounts = unreadCountResult.data || [];

          // Map results
          const lastMessagesMap = {};
          latestMessages.forEach(msg => {
            lastMessagesMap[String(msg.main_id)] = msg;
          });

          const unreadCountMap = {};
          unreadCounts.forEach(row => {
            unreadCountMap[String(row.main_id)] = row.unread_count;
          });

          orders = orders.map(order => ({
            ...order,
            last_message: order.main_id ? lastMessagesMap[String(order.main_id)] : null,
            unread_count: order.main_id ? (unreadCountMap[String(order.main_id)] || 0) : 0
          }));
        }
      } catch (err) {
        console.error('Error fetching messages for orders:', err);
      }
    }

    // Подгружаем теги для ВСЕХ режимов (включая минимальный для канбана)
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: tagsData } = await supabase
        .from('order_tags')
        .select('order_id, tag:tags(*)')
        .in('order_id', orderIds);

      // Группируем теги по order_id
      const tagsByOrder = {};
      tagsData?.forEach(t => {
        if (!tagsByOrder[t.order_id]) tagsByOrder[t.order_id] = [];
        if (t.tag) tagsByOrder[t.order_id].push(t.tag);
      });

      // Присваиваем теги к ордерам
      orders = orders.map(order => ({
        ...order,
        tags: tagsByOrder[order.id] || []
      }));
    }

    const response = { orders };

    // Сохраняем в кэш
    ordersCache.set(cacheKey, response);

    res.json(response);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создаем отдельный эндпоинт для подсчета непрочитанных (Notification Bell)
router.get('/unread-count', auth, async (req, res) => {
  try {
    // 1. Получаем настройки пользователя
    const { data: manager } = await supabase
      .from('managers')
      .select('notification_settings')
      .eq('id', req.manager.id)
      .single();

    const settings = manager?.notification_settings || {};
    const { all_active, statuses } = settings;

    // 2. Находим main_id всех диалогов с непрочитанными сообщениями
    // Важно: считаем "непрочитанными" сообщения от клиентов, у которых нет статуса 'read'
    const { data: unreadData, error: msgError } = await supabase
      .from('messages')
      .select('main_id')
      .eq('is_read', false) // Correctly check boolean is_read column
      .in('author_type', ['user', 'User', 'bubbleUser', 'customer', 'client', 'Client', 'Клиент', 'Telegram', 'bot', 'бот']) // Expanded list
      .not('main_id', 'is', null)
      .order('id', { ascending: false }) // Get latest messages first
      .limit(500); // Limit data size to prevent HeadersOverflowError and performance issues

    if (msgError) throw msgError;

    // Уникальные main_id
    const distinctMainIds = [...new Set(unreadData.map(m => String(m.main_id)))];

    if (distinctMainIds.length === 0) {
      return res.json({ count: 0 });
    }

    // 3. Считаем количество ордеров, соответствующих этим main_id и фильтру статусов
    // SAFETY: Limit number of main_ids to avoid URL overflow
    const SAFE_LIMIT = 200;
    let finalIds = distinctMainIds;
    if (distinctMainIds.length > SAFE_LIMIT) {
      console.warn(`[UnreadCount] Too many unread chats (${distinctMainIds.length}), truncating to ${SAFE_LIMIT} for safety`);
      finalIds = distinctMainIds.slice(0, SAFE_LIMIT);
    }

    let query = supabase
      .from('orders')
      .select('id', { count: 'exact' })
      .in('main_id', finalIds);

    // Если "Все уведомления" выключены и есть выбранные статусы - фильтруем по ним
    if (!all_active && statuses && statuses.length > 0) {
      query = query.in('status', statuses);
    }

    const { count, error: countError } = await query;

    if (countError) {
      console.error('[UnreadCount] Query error:', countError);
      throw countError;
    }

    res.json({ count: count || 0 });

  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить заявку по ID (existing)
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[Orders GET /:id] Searching for order with id: ${id}`);

    let query = supabase
      .from('orders')
      .select(`
        *,
        contact:contacts(*),
        manager:managers!deals_manager_id_fkey(id, name, email),
        tags:order_tags(tag:tags(*))
      `);

    // Optimized Lookup Logic: Strict Main ID lookup only
    const numericId = parseInt(id);

    // Strict lookup by main_id ONLY
    query = query.eq('main_id', numericId);

    let { data, error } = await query.maybeSingle();

    if (!data) {
      console.log(`[Orders GET /:id] Order not found with id: ${id}`);
      return res.status(404).json({ error: 'Order not found' });
    }

    if (error) throw error;

    if (error) throw error;

    data.tags = data.tags?.map(t => t.tag).filter(Boolean) || [];
    data.amount = parseFloat(data.SumInput) || 0;

    res.json(data);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать заявку
router.post('/', auth, async (req, res) => {
  try {
    const {
      contact_id,
      title,
      amount,
      currency,
      status,
      source,
      description,
      due_date,
      type,
    } = req.body;

    const { data, error } = await supabase
      .from('orders')
      .insert({
        contact_id,
        OrderName: title, // Map title to OrderName
        SumInput: amount,
        CurrPair1: currency || 'RUB',
        status: status || 'new',
        type: type || 'exchange',
        source,
        Comment: description, // Map description to Comment
        manager_id: req.manager.id,
        main_id: req.body.main_id || parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`)
      })
      .select('*, contact:contacts(name, phone, email)')
      .single();

    if (error) throw error;

    // Сбрасываем кэш ордеров
    clearCache('orders');

    // Получаем io для уведомлений
    const io = req.app.get('io');

    // Запускаем автоматизации для новой заявки
    runAutomations('order_created', data, { io }).catch(err => {
      console.error('Error running automations for order_created:', err);
    });

    // Проверяем порог суммы для автоматизации
    if (data.SumInput && parseFloat(data.SumInput) > 0) {
      runAutomations('order_amount_threshold', data, { io }).catch(err => {
        console.error('Error running automations for order_amount_threshold:', err);
      });
    }

    // Отправляем Socket.IO событие
    if (io) {
      io.emit('new_order', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить заявку
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, amount, currency, ...otherData } = req.body;

    // Map fields
    const updateData = {
      ...otherData,
      ...(title ? { OrderName: title } : {}),
      ...(description ? { Comment: description } : {}),
      ...(amount !== undefined ? { SumInput: amount } : {}),
      ...(currency ? { CurrPair1: currency } : {})
    };

    // Optimized Lookup Logic: Support both internal id and main_id (like GET endpoint)
    const numericId = parseInt(id);
    let lookupField = 'id';
    let lookupValue = numericId;

    // If ID looks like a main_id (large number), try main_id first
    if (numericId > 1000000000) {
      lookupField = 'main_id';
      lookupValue = numericId;
    }

    // Если меняется статус, получаем старый статус для вебхука
    let oldOrder = null;
    if (updateData.status) {
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, status, main_id')
        .eq(lookupField, lookupValue)
        .maybeSingle();

      if (!existingOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      oldOrder = existingOrder;

      // AUTO-TRACK: Set closed_by_manager_id if moving to a final status
      const FINAL_STATUSES = ['completed', 'client_rejected', 'scammer', 'partially_completed', 'postponed'];
      if (FINAL_STATUSES.includes(updateData.status) && oldOrder && !FINAL_STATUSES.includes(oldOrder.status)) {
        updateData.closed_by_manager_id = req.manager.id;
      }
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq(lookupField, lookupValue)
      .select('*, contact:contacts(name, phone, email)')
      .single();

    if (error) throw error;

    // Сбрасываем кэш ордеров
    clearCache('orders');

    // Получаем io для уведомлений
    const io = req.app.get('io');

    // Если изменился статус, запускаем автоматизации и отправляем вебхук на Bubble
    if (updateData.status && oldOrder && updateData.status !== oldOrder.status) {
      // 1. Создаем системное сообщение во внутреннем чате
      try {
        const { ORDER_STATUSES } = require('../utils/statuses');

        const oldLabel = ORDER_STATUSES[oldOrder.status]?.label || oldOrder.status;
        const newLabel = ORDER_STATUSES[updateData.status]?.label || updateData.status;
        const managerName = req.manager.name || req.manager.email;

        // Format timestamp as DD.MM.YY HH:MM:SS
        const now = new Date();
        const timestamp = now.toLocaleString('ru-RU', {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).replace(',', '');

        // Format: "🔄 Анна смена этапа: Передано Никите (было: Принято Анна) 03.02.26 12:05:31"
        const systemContent = `🔄 ${managerName} смена этапа: ${newLabel} (было: ${oldLabel}) ${timestamp}`;

        const { data: sysMsg, error: sysMsgError } = await supabase
          .from('internal_messages')
          .insert({
            order_id: data.id, // Use actual internal ID from database
            sender_id: req.manager.id, // Or a special system bot ID if preferred
            content: systemContent,
            is_read: false,
            attachment_type: 'system' // Use attachment_type as message_type column likely misses in DB
          })
          .select()
          .single();

        if (!sysMsgError && io) {
          io.to(`order_${data.id}`).emit('new_internal_message', sysMsg);
        }

      } catch (sysErr) {
        console.error('Error creating system status message:', sysErr);
      }

      // 2. Запускаем автоматизации
      runAutomations('order_status_changed', data, { io }).catch(err => {
        console.error('Error running automations for order_status_changed:', err);
      });

      // 3. Отправляем вебхук на Bubble
      if (data.main_id) {
        sendBubbleStatusWebhook({
          mainId: data.main_id,
          newStatus: data.status,
          oldStatus: oldOrder.status
        }).catch(err => {
          console.error('Error sending Bubble webhook:', err);
        });
      } else {
        console.warn('[Bubble Webhook] Skipping: main_id is missing for order', id);
      }
    }

    if (io) {
      io.emit('order_updated', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить все неразобранные заявки (Только админ)
router.delete('/unsorted', auth, requireAdmin, async (req, res) => {
  try {
    console.log(`[Orders] Clear Unsorted requested by ${req.manager.email} (role: ${req.manager.role})`);

    // Delete 'unsorted', 'new', and NULL statuses
    // Using .or() filter syntax for Supabase
    const { error, count } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .or('status.eq.unsorted,status.eq.new,status.is.null');

    if (error) {
      console.error('[Orders] Delete error:', error);
      throw error;
    }

    console.log(`[Orders] Cleared ${count} unsorted/new orders`);

    // Сбрасываем кэш ордеров
    clearCache('orders');

    res.json({ success: true, count });
  } catch (error) {
    console.error('Error clearing unsorted orders:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить заявку
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Сбрасываем кэш ордеров
    clearCache('orders');

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(400).json({ error: error.message });
  }
});

// Массовое изменение статуса
router.post('/bulk/status', auth, async (req, res) => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    // 1. Получаем текущие сделки для сравнения статусов (для вебхуков и логов)
    const { data: oldOrders, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, main_id, OrderName')
      .in('id', ids);

    if (fetchError) throw fetchError;

    // 2. Обновляем статус в БД
    const { data: updatedOrders, error: updateError } = await supabase
      .from('orders')
      .update({ status })
      .in('id', ids)
      .select('*, contact:contacts(name, phone, email)');

    if (updateError) throw updateError;

    // Сбрасываем кэш
    clearCache('orders');

    const io = req.app.get('io');
    const { ORDER_STATUSES } = require('../utils/statuses');
    const managerName = req.manager.name || req.manager.email;

    // 3. Обрабатываем побочные эффекты для каждой сделки
    // Используем Promise.all для параллельного выполнения, но с catch, чтобы одна ошибка не ломала всё
    await Promise.all(updatedOrders.map(async (newOrder) => {
      const oldOrder = oldOrders.find(o => o.id === newOrder.id);

      // Если статус реально изменился
      if (oldOrder && oldOrder.status !== status) {

        // A. Системное сообщение
        try {
          const oldLabel = ORDER_STATUSES[oldOrder.status]?.label || oldOrder.status;
          const newLabel = ORDER_STATUSES[status]?.label || status;

          // Format timestamp as DD.MM.YY HH:MM:SS
          const now = new Date();
          const timestamp = now.toLocaleString('ru-RU', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }).replace(',', '');

          const systemContent = `🔄 ${managerName} смена этапа (массово): ${newLabel} (было: ${oldLabel}) ${timestamp}`;

          const { data: sysMsg } = await supabase
            .from('internal_messages')
            .insert({
              order_id: newOrder.id,
              sender_id: req.manager.id,
              content: systemContent,
              is_read: false,
              attachment_type: 'system'
            })
            .select()
            .single();

          if (sysMsg && io) {
            io.to(`order_${newOrder.id}`).emit('new_internal_message', sysMsg);
          }
        } catch (e) {
          console.error(`[Bulk] Error creating system msg for order ${newOrder.id}:`, e);
        }

        // B. Автоматизации
        runAutomations('order_status_changed', newOrder, { io }).catch(err => {
          console.error(`[Bulk] Automation error order ${newOrder.id}:`, err);
        });

        // C. Bubble Webhook
        if (newOrder.main_id) {
          sendBubbleStatusWebhook({
            mainId: newOrder.main_id,
            newStatus: status,
            oldStatus: oldOrder.status
          }).catch(err => {
            console.error(`[Bulk] Bubble webhook error order ${newOrder.id}:`, err);
          });
        }
      }

      // Socket event update
      if (io) {
        io.emit('order_updated', newOrder);
      }
    }));

    res.json({ success: true, updatedCount: updatedOrders.length });
  } catch (error) {
    console.error('Error in bulk status update:', error);
    res.status(400).json({ error: error.message });
  }
});

// Массовое удаление
router.post('/bulk/delete', auth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    // Удаляем
    const { error, count } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .in('id', ids);

    if (error) throw error;

    clearCache('orders');

    console.log(`[Orders] Bulk deleted ${count} orders by ${req.manager.email}`);

    res.json({ success: true, count });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
