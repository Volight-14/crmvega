const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Функция для получения io из req
const getIO = (req) => req.app.get('io');

// Получить все заявки
router.get('/', auth, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('leads')
      .select(`
        *,
        messages:messages(count),
        manager:managers(name)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({ leads: data, total: count });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать новую заявку
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, email, source, description } = req.body;

    const { data, error } = await supabase
      .from('leads')
      .insert({
        name,
        phone,
        email,
        source,
        description,
        status: 'new'
      })
      .select()
      .single();

    if (error) throw error;

    // Отправляем событие о новой заявке через Socket.IO
    const io = getIO(req);
    if (io) {
      io.emit('new_lead', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить статус заявки
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, manager_id } = req.body;

    const updateData = { status };
    if (manager_id) {
      updateData.manager_id = manager_id;
    }

    const { data, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Отправляем событие об обновлении заявки через Socket.IO
    const io = getIO(req);
    if (io) {
      io.emit('lead_updated', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить заявку по ID с сообщениями
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        messages:messages(*, sender:managers(name)),
        manager:managers(name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
