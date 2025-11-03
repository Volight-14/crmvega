const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Получить все автоматизации
router.get('/', auth, async (req, res) => {
  try {
    const { is_active } = req.query;

    let query = supabase
      .from('automations')
      .select(`
        *,
        manager:managers(name)
      `)
      .order('created_at', { ascending: false });

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ automations: data });
  } catch (error) {
    console.error('Error fetching automations:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить автоматизацию по ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('automations')
      .select(`
        *,
        manager:managers(name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching automation:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать автоматизацию
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      description,
      trigger_type,
      trigger_conditions,
      action_type,
      action_config,
      is_active = true,
    } = req.body;

    const { data, error } = await supabase
      .from('automations')
      .insert({
        name,
        description,
        trigger_type,
        trigger_conditions: trigger_conditions || {},
        action_type,
        action_config,
        is_active,
        manager_id: req.manager.id,
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error creating automation:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить автоматизацию
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('automations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating automation:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить автоматизацию
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting automation:', error);
    res.status(400).json({ error: error.message });
  }
});

// Выполнить автоматизацию вручную (для тестирования)
router.post('/:id/execute', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { entityType, entityId } = req.body; // 'deal', 'contact', 'message'

    const { data: automation, error } = await supabase
      .from('automations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!automation.is_active) {
      return res.status(400).json({ error: 'Automation is not active' });
    }

    // Здесь должна быть логика выполнения автоматизации
    // Пока просто возвращаем успех
    res.json({ success: true, message: 'Automation executed' });
  } catch (error) {
    console.error('Error executing automation:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

