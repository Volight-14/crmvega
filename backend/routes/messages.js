const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Получить сообщения для заявки
router.get('/lead/:leadId', auth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:managers(name)
      `)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить сообщение
router.post('/', auth, async (req, res) => {
  try {
    const { lead_id, content, sender_type = 'manager' } = req.body;
    const sender_id = req.manager.id;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        lead_id,
        content,
        sender_id,
        sender_type
      })
      .select(`
        *,
        sender:managers(name)
      `)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
