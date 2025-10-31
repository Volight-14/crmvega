const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Функция для отправки сообщения пользователю через бота
async function sendMessageToUser(telegramUserId, message) {
  try {
    // Импортируем функцию из бота
    const { sendMessageToUser: botSendMessage } = require('../../bot/index');

    if (botSendMessage) {
      await botSendMessage(telegramUserId, message);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error sending message via bot:', error);
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

module.exports = router;
