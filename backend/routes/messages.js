const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const axios = require('axios');
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

    // Получаем все leads, связанные с этим контактом через telegram_user_id
    // (для совместимости со старыми данными)
    const { data: contact } = await supabase
      .from('contacts')
      .select('phone, email')
      .eq('id', contactId)
      .single();

    let leadIds = [...leadIdsFromDeals];

    if (contact?.phone || contact?.email) {
      const { data: leads } = await supabase
        .from('leads')
        .select('id')
        .or(
          contact.phone ? `phone.eq.${contact.phone}` : 'phone.is.null',
          contact.email ? `email.eq.${contact.email}` : 'email.is.null'
        );

      if (leads && leads.length > 0) {
        leadIds = [...leadIds, ...leads.map(l => l.id)];
      }
    }

    // Убираем дубликаты
    leadIds = [...new Set(leadIds)];

    // Получаем сообщения из leads
    let allMessages = [];
    if (leadIds.length > 0) {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select(`
          *,
          sender:managers(name),
          lead:leads(id, name)
        `)
        .in('lead_id', leadIds)
        .order('created_at', { ascending: true });

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

    // Создаем или находим lead для связи
    if (!leadId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone, email')
        .eq('id', contactId)
        .single();

      if (contact) {
        // Ищем существующий lead или создаем новый
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .or(
            contact.phone ? `phone.eq.${contact.phone}` : 'phone.is.null',
            contact.email ? `email.eq.${contact.email}` : 'email.is.null'
          )
          .limit(1)
          .single();

        if (existingLead) {
          leadId = existingLead.id;
        } else {
          const { data: newLead } = await supabase
            .from('leads')
            .insert({
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              source: 'crm_contact',
            })
            .select()
            .single();

          leadId = newLead?.id;
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
        sender:managers(name),
        lead:leads(id, name)
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
