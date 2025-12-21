const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { runAutomations } = require('../services/automationRunner');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Получить все заявки (orders)
router.get('/', auth, async (req, res) => {
  try {
    const { contact_id, status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('orders')
      .select(`
        *,
        contact:contacts(name, email, phone),
        manager:managers(name),
        tags:order_tags(tag:tags(*))
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (contact_id) {
      query = query.eq('contact_id', contact_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Преобразуем теги и amount (из строки в число)
    const orders = data.map(order => ({
      ...order,
      amount: parseFloat(order.amount) || 0,
      tags: order.tags?.map(t => t.tag).filter(Boolean) || []
    }));

    res.json({ orders });
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
    data.amount = parseFloat(data.amount) || 0;

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
    } = req.body;

    const { data, error } = await supabase
      .from('orders')
      .insert({
        contact_id,
        title,
        amount,
        currency: currency || 'RUB',
        status: status || 'new',
        source,
        description,
        due_date,
        manager_id: req.manager.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Получаем io для уведомлений
    const io = req.app.get('io');

    // Запускаем автоматизации для новой заявки
    runAutomations('order_created', data, { io }).catch(err => {
      console.error('Error running automations for order_created:', err);
    });

    // Проверяем порог суммы для автоматизации
    if (data.amount && parseFloat(data.amount) > 0) {
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
    const updateData = req.body;

    const { data, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Получаем io для уведомлений
    const io = req.app.get('io');

    // Если изменился статус, запускаем автоматизации
    if (updateData.status) {
      runAutomations('order_status_changed', data, { io }).catch(err => {
        console.error('Error running automations for order_status_changed:', err);
      });
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

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
