const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Получить все контакты
router.get('/', auth, async (req, res) => {
  try {
    const { search, status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('contacts')
      .select(`
        *,
        manager:managers(name),
        tags:contact_tags(tag:tags(*))
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Получаем статистику по сделкам для каждого контакта
    const contactIds = data.map(c => c.id);
    const { data: dealsStats } = await supabase
      .from('deals')
      .select('contact_id, amount, status')
      .in('contact_id', contactIds);

    // Подсчитываем статистику
    const statsMap = {};
    dealsStats?.forEach(deal => {
      if (!statsMap[deal.contact_id]) {
        statsMap[deal.contact_id] = { count: 0, total: 0 };
      }
      statsMap[deal.contact_id].count++;
      if (deal.amount) {
        statsMap[deal.contact_id].total += parseFloat(deal.amount);
      }
    });

    // Добавляем статистику к контактам
    const contactsWithStats = data.map(contact => ({
      ...contact,
      deals_count: statsMap[contact.id]?.count || 0,
      deals_total_amount: statsMap[contact.id]?.total || 0,
      tags: contact.tags?.map(t => t.tag).filter(Boolean) || []
    }));

    res.json({ contacts: contactsWithStats });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить контакт по ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: contact, error } = await supabase
      .from('contacts')
      .select(`
        *,
        manager:managers(name),
        tags:contact_tags(tag:tags(*))
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Получаем статистику по сделкам
    const { data: deals } = await supabase
      .from('deals')
      .select('id, title, amount, status, created_at')
      .eq('contact_id', id)
      .order('created_at', { ascending: false });

    contact.deals_count = deals?.length || 0;
    contact.deals_total_amount = deals?.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0) || 0;
    contact.tags = contact.tags?.map(t => t.tag).filter(Boolean) || [];

    res.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать новый контакт
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      company,
      position,
      address,
      birthday,
      rating,
      status,
      comment,
    } = req.body;

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        name,
        phone,
        email,
        company,
        position,
        address,
        birthday,
        rating,
        status: status || 'active',
        comment,
        manager_id: req.manager.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Отправляем Socket.IO событие о новом контакте
    const io = req.app.get('io');
    if (io) {
      io.emit('new_contact', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить контакт
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить контакт
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

