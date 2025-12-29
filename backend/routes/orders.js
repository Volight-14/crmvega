const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { runAutomations } = require('../services/automationRunner');
const { sendBubbleStatusWebhook } = require('../utils/bubbleWebhook');
const { ordersCache, generateCacheKey, clearCache } = require('../utils/cache');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Получить все заявки (orders)
router.get('/', auth, async (req, res) => {
  try {
    const { contact_id, status, limit = 50, offset = 0, minimal } = req.query;

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
        .select('id, contact_id, OrderName, SumInput, CurrPair1, status, created_at, main_id, contact:contacts(name)')
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    } else {
      // Полный режим
      query = supabase
        .from('orders')
        .select(`
          *,
          contact:contacts(id, name, email, phone),
          manager:managers(id, name)
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

    const { data, error } = await query;

    if (error) throw error;

    // Преобразуем amount (из строки в число)
    // Map OrderName to title for frontend compatibility if needed, OR just send OrderName
    // Let's send OrderName and let frontend adapt.
    let orders = data.map(order => ({
      ...order,
      title: order.OrderName, // Alias for backward compatibility if useful
      amount: parseFloat(order.SumInput) || 0,
      currency: order.CurrPair1 || 'RUB',
      description: order.Comment // Alias for backward compatibility
    }));

    // ... (rest of logic) ...
    // Note: I only need to replace up to line 168 (Create Order)
    // But this tool call covers the GET logic.
    // I need to split or cover specific block.
    // The insert logic is further down.

    // Let's target the GET logic first.


    // Загружаем теги отдельным запросом (эффективнее чем N+1)
    if (!isMinimal && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: tagsData } = await supabase
        .from('order_tags')
        .select('order_id, tag:tags(*)')
        .in('order_id', orderIds);

      // Группируем теги по order_id
      const tagsByOrder = {};
      tagsData?.forEach(t => {
        if (!tagsByOrder[t.order_id]) tagsByOrder[t.order_id] = [];
        tagsByOrder[t.order_id].push(t.tag);
      });

      // Присваиваем теги к ордерам
      orders = orders.map(order => ({
        ...order,
        tags: tagsByOrder[order.id] || []
      }));
    } else {
      // В минимальном режиме теги не нужны
      orders = orders.map(order => ({
        ...order,
        tags: []
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

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        contact:contacts(*),
        manager:managers(name),
        tags:order_tags(tag:tags(*))
      `)
      .eq('id', id)
      .single();

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
