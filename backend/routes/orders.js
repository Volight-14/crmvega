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
    const { contact_id, status, tag_id, limit = 50, offset = 0, minimal } = req.query;

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
        // Renamed title -> OrderName
        // Added fields for Kanban card
        // Verified columns via MCP: CityEsp02, DeliveryTime, NextDay, SumOutput, CurrPair2 EXIST.
        .select(`id, contact_id, "OrderName", "SumInput", "CurrPair1", status, created_at, main_id, "CityEsp02", "DeliveryTime", "NextDay", "SumOutput", "CurrPair2", contact:contacts(id, name)${tag_id ? ', order_tags!inner(tag_id)' : ''}`)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    } else {
      // Полный режим
      query = supabase
        .from('orders')
        .select(`
          *,
          contact:contacts(id, name, email, phone),
          manager:managers(id, name)${tag_id ? ', order_tags!inner(tag_id)' : ''}
        `)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    }

    if (contact_id) {
      query = query.eq('contact_id', contact_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (tag_id) {
      query = query.eq('order_tags.tag_id', tag_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Преобразуем amount (из строки в число)
    let orders = data.map(order => ({
      ...order,
      title: order.OrderName, // Alias for backward compatibility if useful
      amount: parseFloat(order.SumInput) || 0,
      currency: order.CurrPair1 || 'RUB',
      description: order.Comment // Alias for backward compatibility
    }));

    // Для минимального режима (Канбан) подгружаем последние сообщения клиентов
    // Для минимального режима (Канбан) подгружаем последние сообщения клиентов
    if (isMinimal && orders.length > 0) {
      try {
        const mainIds = orders
          .map(o => o.main_id)
          .filter(id => id); // Filter out null/undefined

        if (mainIds.length > 0) {
          // Fetch all messages for these orders in one go
          // Warning: potential large payload if chat histories are long. 
          // Ideally use a Postgres View or Function for "latest per group".
          // For now, fetching all and filtering in-memory is vastly faster than 500 requests.
          const { data: allMessages } = await supabase
            .from('messages')
            .select('main_id, content, "Created Date", author_type, status, is_read')
            .in('main_id', mainIds.map(String))
            .in('author_type', ['user', 'Клиент', 'Client', 'customer'])
            .order('"Created Date"', { ascending: false });

          if (allMessages) {
            // Group and pick latest
            const lastMessagesMap = {};
            const unreadCountMap = {};

            for (const msg of allMessages) {
              const mId = String(msg.main_id);

              // Latest message
              if (!lastMessagesMap[mId]) {
                lastMessagesMap[mId] = msg;
              }

              // Count unread
              // Assuming 'status' != 'read' means unread for client messages
              // Or check is_read (which might be used for internal read status? client messages usually use status='delivered')
              // Let's check both: if status is NOT read AND is_read is falsy (if applicable)
              if (msg.status !== 'read' && msg.status !== 'blocked' && msg.status !== 'deleted_chat') {
                unreadCountMap[mId] = (unreadCountMap[mId] || 0) + 1;
              }
            }

            orders = orders.map(order => ({
              ...order,
              last_message: order.main_id ? lastMessagesMap[String(order.main_id)] : null,
              unread_count: order.main_id ? (unreadCountMap[String(order.main_id)] || 0) : 0
            }));
          }
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

// Получить заявку по ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    let query = supabase
      .from('orders')
      .select(`
        *,
        contact:contacts(*),
        manager:managers(name),
        tags:order_tags(tag:tags(*))
      `);

    // Check if id is a large number (likely main_id) or small integer (internal id)
    // main_id is usually a timestamp (13 chars) or similar
    if (/^\d{10,}$/.test(id)) {
      query = query.eq('main_id', id);
    } else {
      query = query.eq('id', id);
    }

    const { data, error } = await query.single();

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

    // Если меняется статус, получаем старый статус для вебхука
    let oldOrder = null;
    if (updateData.status) {
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('status, main_id')
        .eq('id', id)
        .single();

      oldOrder = existingOrder;
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select('*, contact:contacts(name, phone, email)')
      .single();

    if (error) throw error;

    // Сбрасываем кэш ордеров
    clearCache('orders');

    // Получаем io для уведомлений
    const io = req.app.get('io');

    // Если изменился статус, запускаем автоматизации и отправляем вебхук на Bubble
    if (updateData.status && oldOrder) {
      // Запускаем автоматизации
      runAutomations('order_status_changed', data, { io }).catch(err => {
        console.error('Error running automations for order_status_changed:', err);
      });

      // Отправляем вебхук на Bubble (асинхронно, не блокируем ответ)
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

module.exports = router;
