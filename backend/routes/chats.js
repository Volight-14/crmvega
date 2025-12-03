const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { runAutomations } = require('../services/automationRunner');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Получить все чаты
router.get('/', auth, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('chats')
      .select('*', { count: 'exact' })
      .order('Created Date', { ascending: false })
      .range(offset, parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Получаем количество сообщений для каждого чата
    const chatsWithMessages = await Promise.all(
      (data || []).map(async (chat) => {
        const { count: messageCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', chat.lead_id);

        return {
          ...chat,
          messages_count: messageCount || 0,
        };
      })
    );

    res.json({ leads: chatsWithMessages, total: count || 0 });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить чат по ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: chat, error } = await supabase
      .from('chats')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Получаем сообщения чата
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', chat.lead_id)
      .order('Created Date', { ascending: true });

    res.json({
      ...chat,
      messages: messages || [],
    });
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать чат
router.post('/', auth, async (req, res) => {
  try {
    const {
      status = 'new',
      lead_id,
      client,
      chat_id,
      amojo_id_client,
      talk_id,
    } = req.body;

    const { data, error } = await supabase
      .from('chats')
      .insert({
        status,
        lead_id,
        client,
        chat_id,
        amojo_id_client,
        talk_id,
        'Created Date': new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    if (io) {
      io.emit('new_chat', data);
    }

    runAutomations('chat_created', data, { io }).catch(err => {
      console.error('Error running automations for chat_created:', err);
    });

    res.json(data);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить статус чата
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, manager_id } = req.body;

    const updateData = { status };
    if (manager_id) {
      updateData.manager_id = manager_id;
    }

    const { data, error } = await supabase
      .from('chats')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    if (io) {
      io.emit('chat_updated', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating chat status:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

