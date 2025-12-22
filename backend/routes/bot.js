const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
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

    const axios = require('axios');
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

// Отправка сообщения пользователю через бота
router.post('/send-message', auth, async (req, res) => {
  try {
    const { lead_id, message } = req.body;

    // Получаем информацию о заявке (чате)
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('chat_id, client')
      .eq('lead_id', lead_id)
      .single();

    if (chatError || !chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    if (!chat.chat_id) {
      return res.status(400).json({ error: 'У чата нет Telegram ID пользователя' });
    }

    // Отправляем сообщение через бота
    const success = await sendMessageToUser(chat.chat_id, message);

    if (success) {
      // Сохраняем сообщение в базе
      const { data: savedMessage, error: messageError } = await supabase
        .from('messages')
        .insert({
          lead_id,
          content: message,
          sender_id: req.manager.id,
          sender_type: 'manager'
        })
        .select()
        .single();

      if (messageError) throw messageError;

      res.json(savedMessage);
    } else {
      res.status(500).json({ error: 'Не удалось отправить сообщение' });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(400).json({ error: error.message });
  }
});

// Функция для отправки сообщения в CRM
async function sendMessageToCRM(telegramUserId, content, telegramUserInfo = null, req = null) {
  try {
    // 1. Ищем или создаем контакт
    const { data: existingContact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('telegram_user_id', telegramUserId.toString())
      .maybeSingle();

    if (contactError && contactError.code !== 'PGRST116') {
      throw contactError;
    }

    let contactId;
    let contact;

    if (!existingContact) {
      const contactName = telegramUserInfo?.first_name && telegramUserInfo?.last_name
        ? `${telegramUserInfo.first_name} ${telegramUserInfo.last_name}`.trim()
        : telegramUserInfo?.first_name ||
        telegramUserInfo?.username ||
        `Пользователь ${telegramUserId}`;

      const { data: newContact, error: createContactError } = await supabase
        .from('contacts')
        .insert({
          name: contactName,
          phone: null,
          email: null,
          telegram_user_id: telegramUserId.toString(),
          status: 'active',
          comment: 'Автоматически создан из Telegram бота'
        })
        .select()
        .single();

      if (createContactError) throw createContactError;
      contactId = newContact.id;
      contact = newContact;
    } else {
      contactId = existingContact.id;
      contact = existingContact;
    }

    // 2. Ищем активную заявку (Order)
    const terminalStatuses = ['completed', 'scammer', 'client_rejected', 'lost'];
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('contact_id', contactId)
      .not('status', 'in', `(${terminalStatuses.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let currentOrder;

    if (activeOrder) {
      currentOrder = activeOrder;
      // Ensure main_id exists
      if (!currentOrder.main_id) {
        const newId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
        const { data: updatedOrder } = await supabase
          .from('orders')
          .update({ main_id: newId })
          .eq('id', currentOrder.id)
          .select()
          .single();
        currentOrder = updatedOrder || currentOrder;
        currentOrder.main_id = newId; // Fallback
      }
    } else {
      // Создаем новую заявку (Order)
      const newMainId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);

      const { data: newOrder, error: createOrderError } = await supabase
        .from('orders')
        .insert({
          contact_id: contactId,
          title: `Заявка от ${contact.name}`,
          amount: 0,
          currency: 'RUB',
          status: 'unsorted', // Используем 'unsorted' вместо 'new' если так принято, или 'new'
          source: 'telegram_bot',
          description: 'Автоматически созданная заявка из Telegram бота',
          created_at: new Date().toISOString(),
          main_id: newMainId
        })
        .select()
        .single();

      if (createOrderError) throw createOrderError;
      currentOrder = newOrder;

      // Запускаем автоматизации для новой заявки
      if (req && currentOrder) {
        // Warning: automationRunner might need updates to handle 'order_created' instead of 'deal_created'
        // Assuming automationRunner is generic or we just emit socket event here.
        // Let's stick to socket emission for now to avoid breaking automationRunner if it wasn't refactored yet.
        const io = req.app.get('io');
        if (io) {
          io.emit('new_order', currentOrder);
        }
      }
    }

    // 3. Создаем сообщение
    const linkId = currentOrder.main_id;

    const { data: savedMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: linkId,
        main_id: linkId,
        content: content,
        author_type: 'user',
        'Created Date': new Date().toISOString()
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Связываем через order_messages
    await supabase.from('order_messages').insert({
      order_id: currentOrder.id,
      message_id: savedMessage.id
    });

    // Отправляем Socket.IO событие о новом сообщении
    if (req) {
      const io = req.app.get('io');
      if (io && savedMessage) {
        io.to(`order_${currentOrder.id}`).emit('new_client_message', savedMessage);
        // Legacy room support
        io.to(`lead_${linkId}`).emit('new_message', savedMessage);
      }
    }

    return linkId;
  } catch (error) {
    console.error('Error sending message to CRM:', error);
    return null;
  }
}

// Webhook endpoint для Telegram бота
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;

    // Проверяем, что это сообщение
    if (update.message && update.message.text) {
      const telegramUserId = update.message.from.id;
      const messageText = update.message.text;

      // Обрабатываем команды
      if (messageText.startsWith('/')) {
        if (messageText === '/start') {
          await sendMessageToUser(telegramUserId, 'Привет! Я бот поддержки CRM системы. Напишите ваше сообщение, и менеджер свяжется с вами.');
        }
        return res.status(200).end();
      }

      // Отправляем сообщение в CRM (передаем req для доступа к io и информацию о пользователе)
      const telegramUserInfo = update.message.from; // first_name, last_name, username
      const leadId = await sendMessageToCRM(telegramUserId, messageText, telegramUserInfo, req);

      if (leadId) {
        await sendMessageToUser(telegramUserId, 'Ваше сообщение отправлено менеджеру. Ожидайте ответа.');
      } else {
        await sendMessageToUser(telegramUserId, 'Произошла ошибка при отправке сообщения. Попробуйте позже.');
      }
    }

    res.status(200).end();
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint для проверки статуса webhook
router.get('/webhook', (req, res) => {
  res.json({ status: 'ok', message: 'Telegram webhook endpoint' });
});

module.exports = router;
