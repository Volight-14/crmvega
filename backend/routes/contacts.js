const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { runAutomations } = require('../services/automationRunner');

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

    // Получаем статистику по заявкам (orders) для каждого контакта
    const contactIds = data.map(c => c.id);
    const { data: ordersStats } = await supabase
      .from('orders')
      .select('contact_id, amount, status')
      .in('contact_id', contactIds);

    // Подсчитываем статистику
    const statsMap = {};
    ordersStats?.forEach(order => {
      if (!statsMap[order.contact_id]) {
        statsMap[order.contact_id] = { count: 0, total: 0 };
      }
      statsMap[order.contact_id].count++;
      if (order.amount) {
        statsMap[order.contact_id].total += parseFloat(order.amount);
      }
    });

    // Добавляем статистику к контактам
    const contactsWithStats = data.map(contact => ({
      ...contact,
      orders_count: statsMap[contact.id]?.count || 0, // Renamed to orders_count
      orders_total_amount: statsMap[contact.id]?.total || 0, // Renamed to orders_total_amount
      tags: contact.tags?.map(t => t.tag).filter(Boolean) || []
    }));

    res.json({ contacts: contactsWithStats });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить список контактов с последними сообщениями (для Inbox)
router.get('/summary', auth, async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    let query = supabase
      .from('contacts')
      .select('id, name, phone, telegram_user_id, telegram_username, first_name, last_name, last_message_at')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data: contacts, error } = await query;

    if (error) {
      console.error('Error fetching contacts:', error);
      // Fallback to basic fields if extended query fails
      const fallbackQuery = supabase
        .from('contacts')
        .select('id, name, phone, telegram_user_id, last_message_at')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .range(offsetNum, offsetNum + limitNum - 1);

      if (search) {
        fallbackQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data: fallbackContacts, error: fallbackError } = await fallbackQuery;
      if (fallbackError) throw fallbackError;

      // Use fallback data
      contacts = fallbackContacts;
    }

    // Для каждого контакта получаем последнее сообщение
    // Оптимизация: можно было бы делать это одним запросом join, но пока так
    const contactsWithMessages = await Promise.all(contacts.map(async (contact) => {
      // Find latest message linked to this contact via orders or direct link?
      // Logic from messages.js: get all orders, then messages.
      // Simplified: Search messages by lead_id (main_id) of active orders OR direct link if we implemented it.
      // CURRENT DATA MODEL: messages usually link to lead_id (which is correct main_id of an order).
      // Contact -> Orders -> main_id -> Messages.

      // Fast path: Just get latest message created_at?
      // We already have last_message_at on contact (if maintained).
      // Let's assume we need to fetch the actual content snippet.

      // 1. Get all orders for this contact (to find messages and latest order)
      const { data: orders } = await supabase
        .from('orders')
        .select('id, main_id, created_at')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false });

      const leadIds = orders?.map(o => String(o.main_id)).filter(Boolean) || [];
      const latestOrder = orders?.[0]; // The first one is the latest due to sorting

      let lastMessage = null;
      if (leadIds.length > 0) {
        const { data: msg } = await supabase
          .from('messages')
          .select('content, "Created Date", author_type')
          .in('main_id', leadIds)
          .order('"Created Date"', { ascending: false })
          .limit(1)
          .maybeSingle();
        lastMessage = msg;
      }

      // Generate display name with proper fallback chain:
      // 1. first_name + last_name (if available)
      // 2. telegram_username (if available)
      // 3. name field (existing)
      // 4. "User {telegram_user_id}" as last resort
      let displayName = null;

      if (contact.first_name || contact.last_name) {
        displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
      } else if (contact.telegram_username) {
        displayName = `@${contact.telegram_username}`;
      } else if (contact.name && !contact.name.startsWith('User ')) {
        displayName = contact.name;
      } else {
        displayName = `User ${contact.telegram_user_id}`;
      }

      return {
        ...contact,
        name: displayName, // Override with better display name
        last_message: lastMessage,
        // Fallback if last_message_at was not populated yet
        last_active: contact.last_message_at || lastMessage?.['Created Date'],
        latest_order_id: latestOrder?.id
      };
    }));

    // Sort again just in case (if we used values from messages)
    const sorted = contactsWithMessages.sort((a, b) => {
      const tA = new Date(a.last_active || 0).getTime();
      const tB = new Date(b.last_active || 0).getTime();
      return tB - tA;
    });

    res.json(sorted);
  } catch (error) {
    console.error('Error fetching inbox summary:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить контакт по ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    let query = supabase
      .from('contacts')
      .select(`
        *,
        manager:managers(name),
        tags:contact_tags(tag:tags(*))
      `);

    // Check if id is a large number (likely Telegram ID)
    // Telegram IDs are typically > 9 digits. Internal IDs are smaller.
    if (/^\d{9,}$/.test(id)) {
      query = query.eq('telegram_user_id', id);
    } else {
      query = query.eq('id', id);
    }

    const { data: contact, error } = await query.single();

    if (error) throw error;

    // Получаем статистику по заявкам (orders)
    const { data: orders } = await supabase
      .from('orders')
      .select('id, title, amount, status, created_at')
      .eq('contact_id', id)
      .order('created_at', { ascending: false });

    contact.orders_count = orders?.length || 0; // Renamed
    contact.orders_total_amount = orders?.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0) || 0; // Renamed
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

    // Запускаем автоматизации для нового контакта
    runAutomations('contact_created', data).catch(err => {
      console.error('Error running automations for contact_created:', err);
    });

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

