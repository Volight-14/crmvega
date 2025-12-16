const { Telegraf } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';

// Хранение состояний пользователей (в продакшене использовать базу данных)
const userStates = new Map();

// Буфер сообщений для Debounce (защита от частых сообщений)
const messageBuffer = new Map();

// Функция для отправки сообщения в CRM
async function sendMessageToCRM(telegramUserId, content) {
  try {
    // Сначала проверяем, есть ли активная заявка для этого пользователя
    const response = await axios.get(`${API_BASE_URL}/leads`, {
      headers: {
        'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
      },
      params: {
        telegram_user_id: telegramUserId,
        status: 'in_progress'
      }
    });

    const leads = response.data.leads;

    if (leads.length === 0) {
      // Создаем новую заявку
      const leadResponse = await axios.post(`${API_BASE_URL}/leads`, {
        name: `Пользователь ${telegramUserId}`,
        source: 'telegram_bot',
        description: 'Автоматически созданная заявка из Telegram бота',
        telegram_user_id: telegramUserId,
        status: 'new'
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
        }
      });

      const leadId = leadResponse.data.id;

      // Отправляем первое сообщение
      await axios.post(`${API_BASE_URL}/messages`, {
        lead_id: leadId,
        content: content,
        sender_type: 'user'
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
        }
      });

      return leadId;
    } else {
      // Используем существующую заявку
      const leadId = leads[0].id;

      await axios.post(`${API_BASE_URL}/messages`, {
        lead_id: leadId,
        content: content,
        sender_type: 'user'
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
        }
      });

      return leadId;
    }
  } catch (error) {
    console.error('Error sending message to CRM:', error);
    return null;
  }
}

// Отправка накопленных сообщений
async function sendBufferedMessages(telegramUserId) {
  const userData = messageBuffer.get(telegramUserId);
  if (!userData) return;

  const combinedMessage = userData.messages.join('\n');
  // Очищаем буфер СРАЗУ, чтобы новые сообщения создавали новый таймер
  messageBuffer.delete(telegramUserId);

  try {
    const leadId = await sendMessageToCRM(telegramUserId, combinedMessage);

    if (leadId) {
      // Подтверждение пользователю
      await bot.telegram.sendMessage(telegramUserId, 'Ваше сообщение отправлено менеджеру. Ожидайте ответа.');
    } else {
      await bot.telegram.sendMessage(telegramUserId, 'Произошла ошибка при отправке сообщения. Попробуйте позже.');
    }
  } catch (error) {
    console.error('Error in sendBufferedMessages:', error);
    await bot.telegram.sendMessage(telegramUserId, 'Произошла ошибка. Попробуйте позже.');
  }
}


// Команда /start
bot.start((ctx) => {
  ctx.reply(
    'Привет! Я бот поддержки CRM системы. Напишите ваше сообщение, и менеджер свяжется с вами.'
  );
});

// Обработка текстовых сообщений с DEBOUNCE
bot.on('text', async (ctx) => {
  const telegramUserId = ctx.from.id;
  const messageText = ctx.message.text;

  // Если уже есть таймер для этого юзера, сбрасываем его и добавляем сообщение
  if (messageBuffer.has(telegramUserId)) {
    const userData = messageBuffer.get(telegramUserId);
    clearTimeout(userData.timer);
    userData.messages.push(messageText);

    // Перезапускаем таймер (3 секунды)
    userData.timer = setTimeout(() => sendBufferedMessages(telegramUserId), 3000);
  } else {
    // Создаем новую запись
    const timer = setTimeout(() => sendBufferedMessages(telegramUserId), 3000);
    messageBuffer.set(telegramUserId, {
      timer: timer,
      messages: [messageText]
    });
  }
});

// Обработка контактов
bot.on('contact', async (ctx) => {
  const telegramUserId = ctx.from.id;
  const phoneNumber = ctx.message.contact.phone_number;

  try {
    // Обновляем информацию о пользователе
    const response = await axios.get(`${API_BASE_URL}/leads`, {
      headers: {
        'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
      },
      params: {
        telegram_user_id: telegramUserId
      }
    });

    if (response.data.leads.length > 0) {
      const lead = response.data.leads[0];
      await axios.patch(`${API_BASE_URL}/leads/${lead.id}`, {
        phone: phoneNumber
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
        }
      });

      ctx.reply('Спасибо! Ваш номер телефона сохранен.');
    }
  } catch (error) {
    console.error('Error saving phone:', error);
  }
});

// Функция для отправки сообщения пользователю через бота
async function sendMessageToUser(telegramUserId, message) {
  try {
    await bot.telegram.sendMessage(telegramUserId, message);
  } catch (error) {
    console.error('Error sending message to user:', error);
  }
}

// Функция для обработки webhook update
async function handleUpdate(update) {
  try {
    await bot.handleUpdate(update);
  } catch (error) {
    console.error('Error handling update:', error);
  }
}

// Экспортируем функции для использования в API
module.exports = {
  sendMessageToUser,
  handleUpdate
};

// Запуск бота только в development (не на Vercel)
if (process.env.NODE_ENV !== 'production') {
  bot.launch();
  console.log('Bot started in polling mode');

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
