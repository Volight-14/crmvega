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

// Получить все сообщения контакта (из всех сделок)
router.get('/contact/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { limit = 200, offset = 0 } = req.query;

    // Получаем все сделки контакта
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, lead_id, title')
      .eq('contact_id', contactId);

    if (dealsError) throw dealsError;

    const dealIds = deals?.map(d => d.id) || [];
    const leadIdsFromDeals = deals?.map(d => d.lead_id).filter(Boolean) || [];

    // Получаем все chats, связанные с этим контактом через telegram_user_id (chat_id)
    // (для совместимости со старыми данными)
    const { data: contact } = await supabase
      .from('contacts')
      .select('phone, email')
      .eq('id', contactId)
      .single();

    let leadIds = [...leadIdsFromDeals];

    // TODO: Здесь сложнее, так как в chats может не быть phone/email напрямую.
    // Если chats.chat_id матчится с contact.telegram_id (если бы он был), было бы круто.
    // Пока оставим пустым, если нет явной связи. Или если chats.client содержит телефон?
    // В оригинале было поиск по phone/email в leads.
    // В текущей схеме chats нет phone/email.
    // Пропустим этот блок пока, или оставим как есть но с chats (если бы там были поля).
    // Так как полей нет, этот блок поиска по телефону/email не сработает для chats.

    // Убираем дубликаты
    leadIds = [...new Set(leadIds)];

    // Получаем сообщения из messages (связанных с chats через lead_id)
    let allMessages = [];
    if (leadIds.length > 0) {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select(`
          *,
          sender:managers(name)
        `)
        .in('lead_id', leadIds)
        .order('created_at', { ascending: true });

      // Прим: убрали lead:leads(id, name) из select, так как leads нет.
      // Можно попробовать join chats, но FK может не быть настроен в supabase для join syntax.
      // Если нужен join, то lead:chats(lead_id, client) - но скорее всего FK на chats.lead_id нет?
      // lead_id в messages это просто text.

      if (messagesError) throw messagesError;
      allMessages = messages || [];
    }

    // Получаем сообщения из deal_messages
    if (dealIds.length > 0) {
      const { data: dealMessages } = await supabase
        .from('deal_messages')
        .select(`
          message:messages(
            *,
            sender:managers(name),
            lead:leads(id, name)
          ),
          deal:deals(id, title)
        `)
        .in('deal_id', dealIds);

      if (dealMessages && dealMessages.length > 0) {
        const messagesFromDeals = dealMessages
          .filter(dm => dm.message)
          .map(dm => ({
            ...dm.message,
            deal_title: dm.deal?.title,
            deal_id: dm.deal?.id,
          }));
        allMessages = [...allMessages, ...messagesFromDeals];
      }
    }

    // Сортируем по дате и убираем дубликаты
    allMessages = allMessages
      .filter((msg, index, self) => index === self.findIndex(m => m.id === msg.id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(offset, offset + limit);

    res.json(allMessages);
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить сообщение контакту (создает или использует активную сделку)
router.post('/contact/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { content, sender_type = 'manager' } = req.body;
    const sender_id = req.manager.id;

    // Находим активную сделку контакта или создаем новую
    const { data: activeDeal } = await supabase
      .from('deals')
      .select('id, lead_id')
      .eq('contact_id', contactId)
      .in('status', ['new', 'negotiation', 'waiting', 'ready_to_close'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let dealId = activeDeal?.id;
    let leadId = activeDeal?.lead_id;

    // Если нет активной сделки, создаем новую
    if (!dealId) {
      const { data: newDeal, error: dealError } = await supabase
        .from('deals')
        .insert({
          contact_id: parseInt(contactId),
          title: `Сообщение от ${new Date().toLocaleDateString('ru-RU')}`,
          status: 'new',
          manager_id: sender_id,
        })
        .select()
        .single();

      if (dealError) throw dealError;
      dealId = newDeal.id;
    }

    // Создаем или находим chat (бывший lead) для связи
    if (!leadId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone, email')
        .eq('id', contactId)
        .single();

      if (contact) {
        // Ищем существующий chat (по client name = contact.name ???)
        // В chats нет phone/email, поэтому поиск неточный.
        // ПОКА просто создаем новый чат, если не нашли привязанного.
        // Или ищем по имени? Опасно.
        // Давайте создадим новый чат всегда, если lead_id пуст.

        const newLeadId = crypto.randomUUID();
        const { data: newChat, error: chatError } = await supabase
          .from('chats')
          .insert({
            client: contact.name || 'Неизвестный клиент',
            lead_id: newLeadId,
            status: 'new',
            'Created Date': new Date().toISOString()
          })
          .select()
          .single();

        if (!chatError) {
          leadId = newLeadId;
        }

        // Обновляем deal с lead_id
        if (leadId) {
          await supabase
            .from('deals')
            .update({ lead_id: leadId })
            .eq('id', dealId);
        }
      }
    }

    // Создаем сообщение
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: leadId,
        content,
        sender_id,
        sender_type,
      })
      .select(`
        *,
        sender:managers(name)
      `)
      .single();

    if (messageError) throw messageError;

    // Связываем сообщение со сделкой
    if (dealId && message) {
      await supabase
        .from('deal_messages')
        .upsert({
          deal_id: dealId,
          message_id: message.id,
        }, { onConflict: 'deal_id,message_id' });
    }

    // Получаем io для уведомлений
    const io = req.app.get('io');

    // Запускаем автоматизации для нового сообщения
    if (sender_type === 'user') {
      const { runAutomations } = require('../services/automationRunner');
      runAutomations('message_received', message, { io }).catch(err => {
        console.error('Error running automations for message_received:', err);
      });
    }

    // Если сообщение от менеджера, отправляем через Telegram бота и трекаем
    if (sender_type === 'manager' && leadId) {
      // Получаем информацию о чате для отправки в Telegram
      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .select('chat_id')
        .eq('lead_id', leadId)
        .single();

      if (!chatError && chat && chat.chat_id) {
        // Отправляем через бота (не ждем результата, чтобы не блокировать ответ)
        sendMessageToTelegram(chat.chat_id, content).catch(err => {
          console.error('Failed to send message via bot:', err);
        });
      }

      // Трекаем ответ для аналитики AI
      trackOperatorResponse(leadId, content).catch(err => {
        console.error('Failed to track operator response:', err);
      });
    }

    // Отправляем Socket.IO событие
    if (io && leadId) {
      io.to(`lead_${leadId}`).emit('new_message', message);
    }
    if (io) {
      io.emit('contact_message', { contact_id: contactId, message });
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending message to contact:', error);
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

    // Получаем io для уведомлений
    const io = req.app.get('io');

    // Запускаем автоматизации для нового сообщения
    if (sender_type === 'user') {
      runAutomations('message_received', data, { io }).catch(err => {
        console.error('Error running automations for message_received:', err);
      });
    }

    // Если сообщение от менеджера, отправляем через бота и трекаем для AI аналитики
    if (sender_type === 'manager') {
      // Получаем информацию о заявке (чате)
      // Используем chats вместо leads
      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .select('chat_id') // chat_id = telegram_user_id
        .eq('lead_id', lead_id) // lead_id в chats это UUID, и в messages lead_id это тот же UUID
        .single();

      if (!chatError && chat && chat.chat_id) {
        // Отправляем через бота (не ждем результата, чтобы не блокировать ответ)
        sendMessageToTelegram(chat.chat_id, content).catch(err => {
          console.error('Failed to send message via bot:', err);
        });
      }

      // Трекаем ответ для аналитики AI (сравнение с подсказкой)
      trackOperatorResponse(lead_id, content).catch(err => {
        console.error('Failed to track operator response:', err);
      });
    }

    // Отправляем событие о новом сообщении через Socket.IO
    if (io) {
      io.to(`lead_${lead_id}`).emit('new_message', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
