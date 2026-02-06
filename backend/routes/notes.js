const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Получить заметки контакта
router.get('/contact/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    let targetContactId = contactId;
    if (parseInt(contactId) > 100000) {
      const { data: contactResolve } = await supabase
        .from('contacts')
        .select('id')
        .eq('telegram_user_id', contactId)
        .maybeSingle();

      if (contactResolve) {
        targetContactId = contactResolve.id;
      } else {
        return res.json([]);
      }
    }

    const { data, error } = await supabase
      .from('notes')
      .select(`
        *,
        manager:managers!notes_manager_id_fkey(name)
      `)
      .eq('contact_id', targetContactId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить заметки заявки (order)
router.get('/order/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;

    let internalOrderId = orderId;

    // Check if orderId is a main_id (large number)
    if (/^\d{10,}$/.test(orderId)) {
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('main_id', orderId)
        .single();

      if (order) {
        internalOrderId = order.id;
      } else {
        // If logical order not found by main_id, return empty list or 404
        return res.json([]);
      }
    }

    const { data, error } = await supabase
      .from('notes')
      .select(`
        *,
        manager:managers!notes_manager_id_fkey(name)
      `)
      .eq('order_id', internalOrderId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать заметку
router.post('/', auth, async (req, res) => {
  try {
    const { contact_id, order_id, content, priority } = req.body;

    const { data, error } = await supabase
      .from('notes')
      .insert({
        contact_id,
        order_id,
        content,
        priority: priority || 'info',
        manager_id: req.manager.id,
      })
      .select(`
        *,
        manager:managers!notes_manager_id_fkey(name)
      `)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить заметку
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('notes')
      .update(updateData)
      .eq('id', id)
      .eq('manager_id', req.manager.id) // Только автор может редактировать
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить заметку
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('manager_id', req.manager.id); // Только автор может удалять

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
