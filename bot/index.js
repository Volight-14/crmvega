const { Telegraf } = require('telegraf');
const axios = require('axios');
require('dotenv').config();
const crypto = require('crypto');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const API_BASE_URL = process.env.API_BASE_URL || 'https://crmvega.vercel.app/api';

// Хранение состояний пользователей (в продакшене использовать базу данных)
const userStates = new Map();

// Буфер сообщений для Debounce (защита от частых сообщений)
const messageBuffer = new Map();

// Функция для отправки сообщения в CRM
// Функция для отправки сообщения в CRM
async function sendMessageToCRM(telegramUserId, content) {
  try {
    // Используем chat_id для поиска чата по Telegram ID
    // Сначала ищем активный чат с этим пользователем (status = new или in_progress)
    // Так как API chats возвращает список, фильтруем на бэкенде или здесь
    // Мы добавили поддержку req.query.chat_id в backend/routes/chats.js
    const response = await axios.get(`${API_BASE_URL}/chats`, {
      headers: {
        'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
      },
      params: {
        chat_id: telegramUserId.toString()
      }
    });

    const chats = response.data.leads || []; // API возвращает { leads: [], total: ... } несмотря на имя роута

    // Ищем незавершенный чат (не 'closed', не 'won', не 'lost')
    // Можно уточнить статусы, но пока берем первый попавшийся или создаем новый
    // Лучше фильтровать на "активные". Допустим активные это те, что не закрыты.
    const activeChat = chats.find(c => c.status !== 'closed' && c.status !== 'archive');

    let leadId; // Это UUID чата (lead_id column)

    if (!activeChat) {
      // Создаем новый чат
      // Для lead_id генерируем UUID
      const newLeadId = crypto.randomUUID();

      const chatResponse = await axios.post(`${API_BASE_URL}/chats`, {
        client: `Пользователь ${telegramUserId}`,
        chat_id: telegramUserId.toString(),
        lead_id: newLeadId,
        status: 'new',
        // Дополнительные поля, если нужны
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
        }
      });

      leadId = chatResponse.data.lead_id;
    } else {
      leadId = activeChat.lead_id;
    }

    // Отправляем сообщение
    // API /messages принимает lead_id (это UUID чата)
    console.log(`Sending message to CRM: URL=${API_BASE_URL}/messages, lead_id=${leadId}`);
    try {
      await axios.post(`${API_BASE_URL}/messages`, {
        lead_id: leadId,
        content: content,
        sender_type: 'user' // Backend will map this to author_type: 'user'
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
        }
      });
      console.log('Message sent successfully to CRM');
    } catch (msgError) {
      console.error('Failed to post message to API:', msgError.response?.data || msgError.message);
      throw msgError;
    }

    return leadId;

  } catch (error) {
    console.error('Error in sendMessageToCRM full flow:', error);
    console.error('Details:', error.response?.data || error.message);
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
    // Обновляем информацию о пользователе (ищем чат)
    const response = await axios.get(`${API_BASE_URL}/chats`, {
      headers: {
        'Authorization': `Bearer ${process.env.CRM_API_TOKEN}`
      },
      params: {
        chat_id: telegramUserId.toString()
      }
    });

    const chats = response.data.leads || [];
    if (chats.length > 0) {
      const chat = chats[0];
      // В таблице chats нет поля phone, но возможно оно есть в managers или где-то еще? 
      // Или мы хотим обновить client name?
      // Пока оставим обновление client, так как phone в chats схема не показывала.
      // Если нужно сохранять телефон, возможно стоит добавить его в описание/имя клиента

      await axios.patch(`${API_BASE_URL}/chats/${chat.id}`, {
        client: `${chat.client} (${phoneNumber})`
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
