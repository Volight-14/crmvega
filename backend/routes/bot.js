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

    // Получаем информацию о заявке
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('telegram_user_id, name')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    if (!lead.telegram_user_id) {
      return res.status(400).json({ error: 'У заявки нет Telegram ID пользователя' });
    }

    // Отправляем сообщение через бота
    const success = await sendMessageToUser(lead.telegram_user_id, message);

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
async function sendMessageToCRM(telegramUserId, content, req = null) {
  try {
    // Проверяем, есть ли заявка для этого пользователя (берем последнюю, независимо от статуса)
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (leadError) throw leadError;

    if (!leads || leads.length === 0) {
      // Создаем новую заявку
      const { data: lead, error: createError } = await supabase
        .from('leads')
        .insert({
          name: `Пользователь ${telegramUserId}`,
          source: 'telegram_bot',
          description: 'Автоматически созданная заявка из Telegram бота',
          telegram_user_id: telegramUserId,
          status: 'new'
        })
        .select()
        .single();

      if (createError) throw createError;

      // Отправляем первое сообщение
      const { data: savedMessage } = await supabase
        .from('messages')
        .insert({
          lead_id: lead.id,
          content: content,
          is_from_bot: true,
          sender_type: 'user'
        })
        .select()
        .single();

      // Отправляем Socket.IO события
      if (req) {
        const io = req.app.get('io');
        if (io) {
          io.emit('new_lead', lead);
          if (savedMessage) {
            io.to(`lead_${lead.id}`).emit('new_message', savedMessage);
          }
        }
      }

      return lead.id;
    } else {
      // Используем существующую заявку
      const leadId = leads[0].id;

      const { data: savedMessage } = await supabase
        .from('messages')
        .insert({
          lead_id: leadId,
          content: content,
          is_from_bot: true,
          sender_type: 'user'
        })
        .select()
        .single();

      // Отправляем Socket.IO событие о новом сообщении
      if (req) {
        const io = req.app.get('io');
        if (io && savedMessage) {
          io.to(`lead_${leadId}`).emit('new_message', savedMessage);
        }
      }

      return leadId;
    }
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

      // Отправляем сообщение в CRM (передаем req для доступа к io)
      const leadId = await sendMessageToCRM(telegramUserId, messageText, req);

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
