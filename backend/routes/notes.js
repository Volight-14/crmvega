const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Получить заметки контакта
router.get('/contact/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;

    const { data, error } = await supabase
      .from('notes')
      .select(`
        *,
        manager:managers(name)
      `)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить заметки сделки
router.get('/deal/:dealId', auth, async (req, res) => {
  try {
    const { dealId } = req.params;

    const { data, error } = await supabase
      .from('notes')
      .select(`
        *,
        manager:managers(name)
      `)
      .eq('deal_id', dealId)
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
    const { contact_id, deal_id, content, priority } = req.body;

    const { data, error } = await supabase
      .from('notes')
      .insert({
        contact_id,
        deal_id,
        content,
        priority: priority || 'info',
        manager_id: req.manager.id,
      })
      .select(`
        *,
        manager:managers(name)
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

