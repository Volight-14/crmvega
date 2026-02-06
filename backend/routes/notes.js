const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Получить заметки контакта
router.get('/contact/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    let targetContactId = contactId;
    // Always try to resolve Telegram ID first
    const { data: contactResolve } = await supabase
      .from('contacts')
      .select('id')
      .eq('telegram_user_id', contactId)
      .maybeSingle();

    if (contactResolve) {
      targetContactId = contactResolve.id;
    }

    const { data, error } = await supabase
      .from('notes')
      .select(`
        *,
        manager:managers!notes_manager_id_fkey(name)
      `)
      .eq('contact_id', targetContactId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить заметки заявки (order)
router.get('/order/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;

    let internalOrderId = orderId;

    // Check if orderId is a main_id (large number)
    if (/^\d{10,}$/.test(orderId)) {
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('main_id', orderId)
        .single();

      if (order) {
        internalOrderId = order.id;
      } else {
        // If logical order not found by main_id, return empty list or 404
        return res.json([]);
      }
    }

    const { data, error } = await supabase
      .from('notes')
      .select(`
        *,
        manager:managers!notes_manager_id_fkey(name)
      `)
      .eq('order_id', internalOrderId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать заметку
router.post('/', auth, async (req, res) => {
  try {
    const { contact_id, order_id, content, priority } = req.body;

    const { data, error } = await supabase
      .from('notes')
      .insert({
        contact_id,
        order_id,
        content,
        priority: priority || 'info',
        manager_id: req.manager.id,
      })
      .select(`
        *,
        manager:managers!notes_manager_id_fkey(name)
      `)
      .single();

    if (error) throw error;

    // VEG-64: Create system message if note is for an order
    if (order_id) {
      try {
        // IMPORTANT: order_id from frontend might actually be main_id
        // We need to resolve it to the actual order.id
        let actualOrderId = order_id;

        // Try to find order by id first
        const { data: orderData } = await supabase
          .from('orders')
          .select('id, main_id')
          .eq('id', order_id)
          .single();

        // If not found by id, it's probably main_id - get the latest order
        if (!orderData) {
          const { data: orderByMainId } = await supabase
            .from('orders')
            .select('id, main_id')
            .eq('main_id', order_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (orderByMainId) {
            actualOrderId = orderByMainId.id;
          }
        }

        const managerName = req.manager.name || req.manager.email;

        // Format timestamp
        const now = new Date();
        const timestamp = now.toLocaleString('ru-RU', {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).replace(',', '');

        // Truncate content if too long for system message
        const shortContent = content.length > 50 ? content.substring(0, 50) + '...' : content;
        const systemContent = `📝 ${managerName} создал заметку: "${shortContent}" ${timestamp}`;

        const { data: sysMsg, error: sysMsgError } = await supabase
          .from('internal_messages')
          .insert({
            order_id: actualOrderId, // Use actual order.id, not main_id
            sender_id: req.manager.id,
            content: systemContent,
            is_read: false,
            attachment_type: 'system'
          })
          .select()
          .single();

        if (!sysMsgError && sysMsg) {
          // Emit socket event to specific order room
          const io = req.app.get('io');
          if (io) {
            io.to(`order_${actualOrderId}`).emit('new_internal_message', sysMsg);
          }
        }
      } catch (e) {
        console.error('Error creating system message for note:', e);
        // Don't fail the main operation if system message fails
      }
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить заметку
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('notes')
      .update(updateData)
      .eq('id', id)
      .eq('manager_id', req.manager.id) // Только автор может редактировать
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить заметку
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('manager_id', req.manager.id); // Только автор может удалять

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
