const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const axios = require('axios');

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

// Получить сообщения для заявки
router.get('/lead/:leadId', auth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:managers(name)
      `)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить сообщение
router.post('/', auth, async (req, res) => {
  try {
    const { lead_id, content, sender_type = 'manager' } = req.body;
    const sender_id = req.manager.id;

    // Сохраняем сообщение в базе
    const { data, error } = await supabase
      .from('messages')
      .insert({
        lead_id,
        content,
        sender_id,
        sender_type
      })
      .select(`
        *,
        sender:managers(name)
      `)
      .single();

    if (error) throw error;

    // Если сообщение от менеджера, отправляем через бота
    if (sender_type === 'manager') {
      // Получаем информацию о заявке
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('telegram_user_id')
        .eq('id', lead_id)
        .single();

      if (!leadError && lead && lead.telegram_user_id) {
        // Отправляем через бота (не ждем результата, чтобы не блокировать ответ)
        sendMessageToTelegram(lead.telegram_user_id, content).catch(err => {
          console.error('Failed to send message via bot:', err);
        });
      }
    }

    res.json(data);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
