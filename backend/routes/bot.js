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
async function sendMessageToCRM(telegramUserId, content, telegramUserInfo = null, req = null) {
  try {
    // Ищем существующий контакт по telegram_user_id
    const { data: existingContact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    if (contactError && contactError.code !== 'PGRST116') { // PGRST116 = not found
      throw contactError;
    }

    let contactId;
    let contact;
    let leadId;

    if (!existingContact) {
      // Создаем новый контакт
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
          telegram_user_id: telegramUserId,
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

    // Ищем или создаем Lead
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (leadError) throw leadError;

    if (!leads || leads.length === 0) {
      // Создаем новый Lead
      const { data: lead, error: createLeadError } = await supabase
        .from('leads')
        .insert({
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          source: 'telegram_bot',
          description: 'Автоматически созданная заявка из Telegram бота',
          telegram_user_id: telegramUserId,
          status: 'new'
        })
        .select()
        .single();

      if (createLeadError) throw createLeadError;
      leadId = lead.id;

      // Создаем Deal, связанный с Contact и Lead
      const { data: deal, error: createDealError } = await supabase
        .from('deals')
        .insert({
          contact_id: contactId,
          lead_id: leadId,
          title: `Заявка от ${contact.name}`,
          amount: 0,
          currency: 'RUB',
          status: 'new',
          source: 'telegram_bot',
          description: 'Автоматически созданная сделка из Telegram бота'
        })
        .select()
        .single();

      if (createDealError) {
        console.error('Error creating deal:', createDealError);
        // Не прерываем выполнение, если не удалось создать Deal
      }

      // Запускаем автоматизации для новой сделки
      if (req && deal) {
        const { runAutomations } = require('../services/automationRunner');
        runAutomations('deal_created', deal, { io: req.app.get('io') }).catch(err => {
          console.error('Error running automations for deal_created:', err);
        });
      }

      // Отправляем Socket.IO события
      if (req) {
        const io = req.app.get('io');
        if (io) {
          io.emit('new_contact', contact);
          io.emit('new_lead', lead);
          if (deal) {
            io.emit('new_deal', deal);
          }
        }
      }
    } else {
      // Используем существующий Lead
      leadId = leads[0].id;

      // Проверяем, есть ли активная Deal для этого контакта
      const { data: activeDeal } = await supabase
        .from('deals')
        .select('id')
        .eq('contact_id', contactId)
        .eq('lead_id', leadId)
        .in('status', ['new', 'negotiation', 'waiting', 'ready_to_close'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Если нет активной Deal, создаем новую
      if (!activeDeal) {
        const { data: newDeal } = await supabase
          .from('deals')
          .insert({
            contact_id: contactId,
            lead_id: leadId,
            title: `Заявка от ${contact.name}`,
            amount: 0,
            currency: 'RUB',
            status: 'new',
            source: 'telegram_bot',
            description: 'Автоматически созданная сделка из Telegram бота'
          })
          .select()
          .single();

        if (req && newDeal) {
          const io = req.app.get('io');
          if (io) {
            io.emit('new_deal', newDeal);
          }
        }
      }
    }

    // Создаем сообщение
    const { data: savedMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: leadId,
        content: content,
        is_from_bot: true,
        sender_type: 'user'
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Запускаем автоматизации для нового сообщения
    if (req) {
      const { runAutomations } = require('../services/automationRunner');
      runAutomations('message_received', savedMessage, { io: req.app.get('io') }).catch(err => {
        console.error('Error running automations for message_received:', err);
      });
    }

    // Отправляем Socket.IO событие о новом сообщении
    if (req) {
      const io = req.app.get('io');
      if (io && savedMessage) {
        io.to(`lead_${leadId}`).emit('new_message', savedMessage);
        io.emit('contact_message', { contact_id: contactId, message: savedMessage });
      }
    }

    return leadId;
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
