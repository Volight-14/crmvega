const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const axios = require('axios');
const crypto = require('crypto');
const { runAutomations } = require('../services/automationRunner');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Функция для отправки сообщения через Telegram бота
async function sendMessageToTelegram(telegramUserId, message) {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN не установлен');
      return false;
    }

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: telegramUserId,
      text: message
    });

    return true;
  } catch (error) {
    console.error('Error sending message via bot:', error.response?.data || error.message);
    return false;
  }
}

// Функция для отслеживания ответа оператора (сравнение с AI подсказкой)
async function trackOperatorResponse(leadId, content) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return;
    }

    await axios.post(
      `${process.env.SUPABASE_URL}/functions/v1/track-operator-response`,
      {
        type: 'INSERT',
        record: {
          lead_id: leadId,
          content: content,
          author_type: 'Оператор',
          timestamp: Math.floor(Date.now() / 1000)
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 секунд таймаут, не блокируем основной запрос
      }
    );

    console.log(`[TrackResponse] Tracked operator response for lead ${leadId}`);
  } catch (error) {
    // Не критичная ошибка - просто логируем
    console.error('Error tracking operator response:', error.message);
  }
}

// Получить сообщения для заявки
router.get('/lead/:leadId', auth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('messages')
      .select(`*`)
      .eq('main_id', leadId)
      .order('"Created Date"', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить все сообщения контакта (из всех заявок)
router.get('/contact/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { limit = 200, offset = 0 } = req.query;

    // Получаем все заявки контакта
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, main_id, title')
      .eq('contact_id', contactId);

    if (ordersError) throw ordersError;

    console.log(`[GET /contact/${contactId}] Found ${orders?.length} orders`);

    const orderIds = orders?.map(o => o.id) || [];
    let leadIds = [];

    orders?.forEach(o => {
      if (o.main_id) leadIds.push(String(o.main_id));
    });

    console.log(`[GET /contact/${contactId}] Order leadIds:`, leadIds);

    // Также добавляем telegram_user_id контакта
    const { data: contact } = await supabase
      .from('contacts')
      .select('telegram_user_id')
      .eq('id', contactId)
      .maybeSingle();

    if (contact?.telegram_user_id) {
      const tgId = String(contact.telegram_user_id);
      console.log(`[GET /contact/${contactId}] Adding TG ID:`, tgId);
      leadIds.push(tgId);
    }

    // Убираем дубликаты
    leadIds = [...new Set(leadIds)];
    console.log(`[GET /contact/${contactId}] Final leadIds to search:`, leadIds);

    // Получаем сообщения из messages
    let allMessages = [];
    if (leadIds.length > 0) {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select(`*`)
        .in('main_id', leadIds)
        .order('"Created Date"', { ascending: true });

      if (messagesError) throw messagesError;
      allMessages = messages || [];
    }

    // Получаем сообщения из order_messages
    if (orderIds.length > 0) {
      const { data: orderMessages } = await supabase
        .from('order_messages')
        .select(`
          message:messages(*),
          order:orders(id, title)
        `)
        .in('order_id', orderIds);

      if (orderMessages && orderMessages.length > 0) {
        const messagesFromOrders = orderMessages
          .filter(om => om.message)
          .map(om => ({
            ...om.message,
            order_title: om.order?.title,
            order_id: om.order?.id,
          }));
        allMessages = [...allMessages, ...messagesFromOrders];
      }
    }

    // Сортируем по дате и убираем дубликаты
    allMessages = allMessages
      .filter((msg, index, self) => index === self.findIndex(m => m.id === msg.id))
      .sort((a, b) => new Date(a['Created Date']).getTime() - new Date(b['Created Date']).getTime())
      .slice(offset, offset + limit);

    res.json(allMessages);
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить сообщение контакту (создает или использует активную заявку)
router.post('/contact/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { content, sender_type = 'manager' } = req.body;

    // Находим активную заявку контакта или создаем новую
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('id, main_id')
      .eq('contact_id', contactId)
      .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let orderId = activeOrder?.id;
    let leadId = activeOrder?.main_id;
    console.log(`[POST /contact/${contactId}] Initial: orderId=${orderId}, leadId=${leadId}`);

    // Если нет активной заявки, создаем новую
    if (!orderId) {
      console.log(`[POST /contact/${contactId}] No active order. Creating new.`);
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: parseInt(contactId),
          title: `Сообщение от ${new Date().toLocaleDateString('ru-RU')}`,
          status: 'new',
          type: 'inquiry',
          manager_id: req.manager.id,
        })
        .select()
        .single();

      if (orderError) throw orderError;
      orderId = newOrder.id;
      console.log(`[POST /contact/${contactId}] Created new order:`, newOrder.id);
    }

    // Генерируем leadId (thread ID) если нет
    if (!leadId) {
      // Если у заявки нет ID чата, генерируем новый NUMERIC ID
      leadId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
      console.log(`[POST /contact/${contactId}] Generated new leadId:`, leadId);

      await supabase
        .from('orders')
        .update({ main_id: leadId }) // Обновляем только main_id
        .eq('id', orderId);
    }

    console.log(`[POST /contact/${contactId}] Final leadId for message:`, leadId);

    // Создаем сообщение
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        main_id: leadId,
        content,
        author_type: sender_type === 'user' ? 'user' : 'Менеджер',
      })
      .select(`*`)
      .single();

    if (messageError) throw messageError;

    // Обновляем last_message_at у контакта
    await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', contactId);

    // Связываем сообщение с заявкой
    if (orderId && message && message.id) {
      await supabase
        .from('order_messages')
        .upsert({
          order_id: orderId,
          message_id: message.id,
        }, { onConflict: 'order_id,message_id' });
    }

    // Получаем io для уведомлений
    const io = req.app.get('io');

    // Если сообщение от менеджера, отправляем через Telegram бота (если есть telegram_user_id)
    if (sender_type === 'manager' && leadId) {
      // Ищем contact telegram_id
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', contactId)
        .single();

      if (contact && contact.telegram_user_id) {
        sendMessageToTelegram(contact.telegram_user_id, content).catch(err => {
          console.error('Failed to send message via bot:', err);
        });
      }

      // Трекаем ответ для аналитики AI
      trackOperatorResponse(leadId, content).catch(err => {
        console.error('Failed to track operator response:', err);
      });
    }

    // Отправляем Socket.IO событие
    // Try sending to explicit order room too
    if (io) {
      if (leadId) io.to(`lead_${leadId}`).emit('new_message', message);
      io.to(`order_${orderId}`).emit('new_message', message);
      io.emit('contact_message', { contact_id: contactId, message });
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending message to contact:', error);
    res.status(400).json({ error: error.message });
  }
});

// REMOVED: Generic POST /messages/ endpoint - not used in frontend
// Use /messages/contact/:contactId or /order-messages/:orderId/client instead

module.exports = router;
