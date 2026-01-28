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
        manager:managers!contacts_manager_id_fkey(name),
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
      .select('id, name, phone, telegram_user_id, telegram_username, first_name, last_name, last_message_at, avatar_url')
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
        .select('id, name, phone, telegram_user_id, last_message_at, avatar_url')
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

    // ОПТИМИЗАЦИЯ: Получаем все заявки для всех контактов ОДНИМ запросом
    const contactIds = contacts.map(c => c.id);
    const { data: allOrders } = await supabase
      .from('orders')
      .select('id, contact_id, main_id, created_at, status, manager:managers!deals_manager_id_fkey(name)')
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false });

    // Группируем заявки по contact_id
    const ordersByContact = {};
    allOrders?.forEach(order => {
      if (!ordersByContact[order.contact_id]) {
        ordersByContact[order.contact_id] = [];
      }
      ordersByContact[order.contact_id].push(order);
    });

    // Собираем все main_id для получения сообщений (конвертируем в числа)
    const allMainIds = [...new Set(allOrders?.map(o => o.main_id).filter(Boolean) || [])];

    // ОПТИМИЗАЦИЯ: Получаем последние сообщения для всех main_id ОДНИМ запросом
    const { data: allMessages } = await supabase
      .from('messages')
      .select('main_id, content, "Created Date", author_type')
      .in('main_id', allMainIds)
      .order('"Created Date"', { ascending: false });

    // Группируем сообщения по main_id (берём только последнее для каждого)
    // Группируем сообщения по main_id (берём только последнее для каждого)
    const lastMessageByMainId = {};
    allMessages?.forEach(msg => {
      const mainId = String(msg.main_id);
      if (!lastMessageByMainId[mainId]) {
        lastMessageByMainId[mainId] = msg;
      }
    });

    // ОПТИМИЗАЦИЯ: Получаем количество непрочитанных (tail consecutive)
    const { data: unreadData } = await supabase
      .rpc('get_unread_client_counts', {
        target_main_ids: allMainIds.map(String)
      });

    const unreadMap = {};
    unreadData?.forEach(item => {
      unreadMap[String(item.main_id)] = item.unread_count;
    });

    // Собираем данные для каждого контакта
    const contactsWithMessages = contacts.map(contact => {
      const orders = ordersByContact[contact.id] || [];
      const latestOrder = orders[0]; // Уже отсортированы по created_at desc

      // Находим последнее сообщение среди всех заявок контакта
      let lastMessage = null;
      let lastMessageTime = null;

      orders.forEach(order => {
        const msg = lastMessageByMainId[String(order.main_id)];
        if (msg) {
          const msgTime = new Date(msg['Created Date']).getTime();
          if (!lastMessageTime || msgTime > lastMessageTime) {
            lastMessage = msg;
            lastMessageTime = msgTime;
          }
        }
      });

      // Генерируем отображаемое имя
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
        name: displayName,
        last_message: lastMessage,
        last_active: contact.last_message_at || lastMessage?.['Created Date'],
        latest_order_id: latestOrder?.id || null, // Используем реальный order.id, НЕ main_id!
        latest_order_main_id: latestOrder?.main_id || null, // Добавляем main_id для ссылок
        last_order_status: latestOrder?.status,
        last_order_status: latestOrder?.status,
        responsible_person: latestOrder?.manager?.name,
        unread_count: orders.reduce((sum, o) => sum + (unreadMap[String(o.main_id)] || 0), 0)
      };
    });

    // Сортируем по последней активности
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
        manager:managers!contacts_manager_id_fkey(name),
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
      .select('id, OrderName, amount, status, created_at')
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

