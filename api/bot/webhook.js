const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Функция для отправки сообщения пользователю через Telegram Bot API
async function sendMessageToUser(telegramUserId, message) {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN не установлен');
      return false;
    }

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramUserId,
        text: message
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending message to user:', error.message);
    return false;
  }
}

// Функция для отправки сообщения в CRM
async function sendMessageToCRM(telegramUserId, content, telegramMessageId) {
  try {
    // 1. Находим или создаем контакт
    let contactId = null;
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('telegram_user_id', telegramUserId.toString())
      .maybeSingle();

    if (contact) {
      contactId = contact.id;
    } else {
      // Создаем контакт
      const { data: newContact, error: createError } = await supabase
        .from('contacts')
        .insert({
          name: `User ${telegramUserId}`,
          telegram_user_id: telegramUserId.toString(),
          status: 'active'
        })
        .select()
        .single();

      if (createError) throw createError;
      contactId = newContact.id;
    }

    // 2. Ищем активную заявку (Order)
    const terminalStatuses = ['completed', 'scammer', 'client_rejected', 'lost'];

    // Fetch recent orders effectively and filter in JS to avoid query syntax risks
    const { data: recentOrders, error: fetchOrderError } = await supabase
      .from('orders')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (fetchOrderError) console.error('Error fetching contact orders:', fetchOrderError);

    const activeOrders = recentOrders ? recentOrders.filter(o => !terminalStatuses.includes(o.status)) : [];

    let currentOrder = null;

    if (activeOrders && activeOrders.length > 0) {
      currentOrder = activeOrders[0]; // Take the most recent active one
    } else {
      // Генерируем новый main_id (numeric)
      // Используем timestamp + random suffix to fit in numeric? 
      // Or just a large random number. Numeric implies db might hold it as arbitrary precision or integer?
      // Postgres numeric is arbitrary precision. Javascript numbers are doubles.
      // Let's use Date.now() + distinct random part.
      // Note: Safe max integer in JS is 9e15. Date.now() is 1.7e12. we have space.
      const newMainId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: contactId,
          title: `Order from TG ${telegramUserId}`,
          status: 'unsorted', // Неразобранное
          created_at: new Date().toISOString(),
          main_id: newMainId
        })
        .select()
        .single();

      if (orderError) throw orderError;
      currentOrder = newOrder;
    }

    // 3. Сохраняем сообщение
    let linkId = currentOrder.main_id;

    if (!linkId) {
      // Если у найденной старой заявки нет main_id, создадим его
      const newId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
      await supabase.from('orders').update({ main_id: newId }).eq('id', currentOrder.id);
      linkId = newId;
    }

    const { data: savedMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        lead_id: linkId, // Дублируем для совместимости
        main_id: linkId,
        content: content,
        author_type: 'user',
        message_id_tg: telegramMessageId,
        'Created Date': new Date().toISOString()
      })
      .select()
      .single();

    if (msgError) throw msgError;

    // Также привяжем через order_messages для надежности
    if (savedMessage) {
      await supabase.from('order_messages').insert({
        order_id: currentOrder.id,
        message_id: savedMessage.id
      });
    }

    return linkId;

  } catch (error) {
    console.error('Error sending message to CRM:', error);
    return null;
  }
}

// Vercel serverless function
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Telegram webhook endpoint (Orders)' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;

    // Проверяем, что это сообщение
    if (update.message && update.message.text) {
      const telegramUserId = update.message.from.id;
      const messageText = update.message.text;
      const messageId = update.message.message_id;

      // Игнорируем команды
      if (messageText.startsWith('/')) {
        if (messageText === '/start') {
          await sendMessageToUser(telegramUserId, 'Привет! Я бот поддержки. Напишите, и мы создадим заявку.');
        }
        return res.status(200).end();
      }

      // Отправляем сообщение в CRM
      const leadId = await sendMessageToCRM(telegramUserId, messageText, messageId);

      // Не отправляем подтверждение каждый раз, чтобы не спамить?
      // Или отправляем? Пользователь не уточнял. Оставим молчание или "Принято".
      if (!leadId) {
        // await sendMessageToUser(telegramUserId, 'Ошибка обработки.'); 
      }
    }

    res.status(200).end();
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
