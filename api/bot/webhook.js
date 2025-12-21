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
    // Активной считаем любую, которая не в статусе 'completed' или 'scammer' или 'client_rejected'
    const terminalStatuses = ['completed', 'scammer', 'client_rejected', 'lost'];
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('contact_id', contactId)
      .not('status', 'in', `(${terminalStatuses.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(1);

    let currentOrder = null;

    if (activeOrders && activeOrders.length > 0) {
      currentOrder = activeOrders[0];
    } else {
      // Создаем новую заявку (Order)
      // Генерируем новый main_id если нужно, или просто order
      // Пользователь сказал Вариант А: Сразу создавать.
      // Для main_id генерируем UUID если нет из Bubble
      const newMainId = crypto.randomUUID();

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: contactId,
          title: `Order from Telegram ${telegramUserId}`,
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
    // Используем main_id заявки как lead_id для сообщения
    const linkId = currentOrder.main_id || currentOrder.external_id || currentOrder.lead_id || crypto.randomUUID();
    // Если у заявки нет linkId (старая?), сгенерируем? 
    // Лучше если мы создали newOrder, у него есть main_id.
    // Если нашли старый order, у него должен быть main_id (мы добавили колонку). Если пусто - обновим?
    if (!currentOrder.main_id) {
      await supabase.from('orders').update({ main_id: linkId }).eq('id', currentOrder.id);
    }
    const finalLinkId = currentOrder.main_id || linkId;

    await supabase
      .from('messages')
      .insert({
        lead_id: finalLinkId,
        main_id: finalLinkId,
        content: content,
        author_type: 'user',
        message_id_tg: telegramMessageId,
        'Created Date': new Date().toISOString()
      });

    // Также привяжем через order_messages для надежности
    // Но нам нужен id созданного сообщения. 
    // Изменим insert выше чтобы вернуть данные.

    return finalLinkId;

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
