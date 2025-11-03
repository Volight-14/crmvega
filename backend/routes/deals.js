const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Получить все сделки
router.get('/', auth, async (req, res) => {
  try {
    const { contact_id, status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('deals')
      .select(`
        *,
        contact:contacts(name, email, phone),
        manager:managers(name),
        tags:deal_tags(tag:tags(*))
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

    // Преобразуем теги
    const deals = data.map(deal => ({
      ...deal,
      tags: deal.tags?.map(t => t.tag).filter(Boolean) || []
    }));

    res.json({ deals });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить сделку по ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('deals')
      .select(`
        *,
        contact:contacts(*),
        manager:managers(name),
        tags:deal_tags(tag:tags(*))
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    data.tags = data.tags?.map(t => t.tag).filter(Boolean) || [];

    res.json(data);
  } catch (error) {
    console.error('Error fetching deal:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать сделку
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
      .from('deals')
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

    // Отправляем Socket.IO событие
    const io = req.app.get('io');
    if (io) {
      io.emit('new_deal', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating deal:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить сделку
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('deals')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Отправляем Socket.IO событие
    const io = req.app.get('io');
    if (io) {
      io.emit('deal_updated', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating deal:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить сделку
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting deal:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

