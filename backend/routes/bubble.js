const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { runAutomations } = require('../services/automationRunner');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware для проверки секретного токена
const verifyWebhookToken = (req, res, next) => {
  const token = req.headers['x-webhook-token'] || req.headers['authorization']?.replace('Bearer ', '');
  const expectedToken = process.env.BUBBLE_WEBHOOK_SECRET;

  if (!expectedToken) {
    console.error('[Bubble Webhook] BUBBLE_WEBHOOK_SECRET не установлен в переменных окружения');
    return res.status(500).json({ 
      success: false, 
      error: 'Webhook secret not configured' 
    });
  }

  if (!token || token !== expectedToken) {
    console.warn(`[Bubble Webhook] Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid webhook token' 
    });
  }

  next();
};

// Middleware для логирования
router.use((req, res, next) => {
  console.log(`[Bubble Webhook] ${req.method} ${req.path}`, {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    hasToken: !!(req.headers['x-webhook-token'] || req.headers['authorization'])
  });
  next();
});

// Тестовый endpoint для проверки (без токена, только для диагностики)
router.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Bubble webhook endpoint is working',
    endpoints: {
      chat: 'POST /api/webhook/bubble/chat',
      message: 'POST /api/webhook/bubble/message',
      updateChat: 'PATCH /api/webhook/bubble/chat/:id',
      updateMessage: 'PATCH /api/webhook/bubble/message/:id'
    },
    note: 'All POST/PATCH endpoints require X-Webhook-Token header'
  });
});

// Webhook для создания чата из Bubble
router.post('/chat', verifyWebhookToken, async (req, res) => {
  try {
    const {
      status,
      'Created Date': createdDate,
      AMOid_new,
      lead_id,
      client,
      chat_id,
      amojo_id_client,
      talk_id,
      'Modified Date': modifiedDate,
      'Created By': createdBy,
    } = req.body;

    // Нормализация и подготовка данных для вставки
    const chatData = {
      status: (status || 'new').toLowerCase(),
      'Created Date': createdDate || new Date().toISOString(),
      AMOid_new: AMOid_new ? parseInt(AMOid_new) : null,
      lead_id: lead_id ? String(lead_id).trim() : null,
      client: client ? String(client).trim() : null,
      chat_id: chat_id ? String(chat_id).trim() : null,
      amojo_id_client: amojo_id_client ? String(amojo_id_client).trim() : null,
      talk_id: talk_id ? String(talk_id).trim() : null,
      'Modified Date': modifiedDate || new Date().toISOString(),
      'Created By': createdBy || null,
    };

    // Проверяем, существует ли уже чат с таким chat_id или lead_id
    let existingChat = null;
    if (chat_id) {
      const { data: chatByChatId } = await supabase
        .from('chats')
        .select('id')
        .eq('chat_id', chat_id)
        .maybeSingle();
      existingChat = chatByChatId;
    }

    if (!existingChat && lead_id) {
      const { data: chatByLeadId } = await supabase
        .from('chats')
        .select('id')
        .eq('lead_id', lead_id)
        .maybeSingle();
      existingChat = chatByLeadId;
    }

    let result;
    if (existingChat) {
      // Обновляем существующий чат
      const { data, error } = await supabase
        .from('chats')
        .update(chatData)
        .eq('id', existingChat.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Создаем новый чат
      const { data, error } = await supabase
        .from('chats')
        .insert(chatData)
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Отправляем Socket.IO событие о новом чате
      const io = req.app.get('io');
      if (io) {
        io.emit('new_chat', result);
      }

      // Запускаем автоматизации для нового чата
      runAutomations('chat_created', result, { io }).catch(err => {
        console.error('Error running automations for chat_created:', err);
      });
    }

    console.log(`[Bubble Webhook] Chat ${existingChat ? 'updated' : 'created'}:`, result.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating/updating chat from Bubble:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message,
      details: error.details || null
    });
  }
});

// Webhook для создания сообщения из Bubble
router.post('/message', verifyWebhookToken, async (req, res) => {
  try {
    const {
      lead_id,
      content,
      'Created Date': createdDate,
      author_type,
      message_type,
      message_id_tg,
      timestamp,
      'Modified Date': modifiedDate,
      'Created By': createdBy,
      author_amojo_id,
      message_id_amo,
      user,
      reply_to_mess_id_tg,
      caption,
      conversation_id,
      order_status,
    } = req.body;

    // Валидация обязательных полей
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'content is required and must be a non-empty string' 
      });
    }

    // Маппинг ролей из Bubble на author_type
    // Роли менеджеров: Админ, Менеджер, Оператор, Служба заботы, Бот
    // Роль пользователя: Клиент
    const managerRoles = ['админ', 'менеджер', 'оператор', 'служба заботы', 'бот'];
    const userRoles = ['клиент'];
    
    // Нормализуем author_type (trim + toLowerCase)
    const normalizedAuthorType = author_type ? String(author_type).trim().toLowerCase() : null;
    
    if (!normalizedAuthorType) {
      return res.status(400).json({ 
        success: false, 
        error: 'author_type is required',
        received: author_type
      });
    }

    // Определяем тип автора на основе роли
    let mappedAuthorType;
    if (managerRoles.includes(normalizedAuthorType)) {
      mappedAuthorType = 'manager';
    } else if (userRoles.includes(normalizedAuthorType)) {
      mappedAuthorType = 'user';
    } else {
      return res.status(400).json({ 
        success: false, 
        error: `Unknown author_type: "${author_type}". Allowed values: Админ, Менеджер, Оператор, Служба заботы, Бот, Клиент`,
        received: author_type,
        normalized: normalizedAuthorType
      });
    }

    // Нормализация и подготовка данных для вставки
    const messageData = {
      lead_id: lead_id ? String(lead_id).trim() : null,
      content: content.trim(),
      'Created Date': createdDate || new Date().toISOString(),
      author_type: mappedAuthorType,
      message_type: (message_type || 'text').toLowerCase(),
      message_id_tg: message_id_tg || null,
      timestamp: timestamp || null,
      'Modified Date': modifiedDate || new Date().toISOString(),
      'Created By': createdBy || null,
      author_amojo_id: author_amojo_id || null,
      message_id_amo: message_id_amo || null,
      user: user || null,
      reply_to_mess_id_tg: reply_to_mess_id_tg || null,
      caption: caption || null,
      conversation_id: conversation_id || null,
      order_status: order_status || null,
    };

    // Проверяем, существует ли уже сообщение с таким message_id_amo или message_id_tg
    let existingMessage = null;
    if (message_id_amo) {
      const { data: msgByAmo } = await supabase
        .from('messages')
        .select('id')
        .eq('message_id_amo', message_id_amo)
        .maybeSingle();
      existingMessage = msgByAmo;
    }

    if (!existingMessage && message_id_tg) {
      const { data: msgByTg } = await supabase
        .from('messages')
        .select('id')
        .eq('message_id_tg', message_id_tg)
        .maybeSingle();
      existingMessage = msgByTg;
    }

    let result;
    if (existingMessage) {
      // Обновляем существующее сообщение
      const { data, error } = await supabase
        .from('messages')
        .update(messageData)
        .eq('id', existingMessage.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Создаем новое сообщение
      const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Отправляем Socket.IO событие о новом сообщении
      const io = req.app.get('io');
      if (io) {
        if (lead_id) {
          io.to(`lead_${lead_id}`).emit('new_message', result);
        }
        io.emit('new_message_bubble', result);
      }

      // Запускаем автоматизации для нового сообщения
      runAutomations('message_received', result, { io }).catch(err => {
        console.error('Error running automations for message_received:', err);
      });
    }

    console.log(`[Bubble Webhook] Message ${existingMessage ? 'updated' : 'created'}:`, result.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating/updating message from Bubble:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message,
      details: error.details || null
    });
  }
});

// Webhook для обновления чата из Bubble
router.patch('/chat/:id', verifyWebhookToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Удаляем id из данных обновления, если он там есть
    delete updateData.id;

    const { data, error } = await supabase
      .from('chats')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Отправляем Socket.IO событие об обновлении чата
    const io = req.app.get('io');
    if (io) {
      io.emit('chat_updated', data);
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error updating chat from Bubble:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Webhook для обновления сообщения из Bubble
router.patch('/message/:id', verifyWebhookToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Удаляем id из данных обновления, если он там есть
    delete updateData.id;

    const { data, error } = await supabase
      .from('messages')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Отправляем Socket.IO событие об обновлении сообщения
    const io = req.app.get('io');
    if (io) {
      if (data.lead_id) {
        io.to(`lead_${data.lead_id}`).emit('message_updated', data);
      }
      io.emit('message_updated_bubble', data);
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error updating message from Bubble:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;

