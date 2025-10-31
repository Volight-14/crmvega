const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/bot', require('./routes/bot'));

// Socket.IO для real-time общения
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Присоединение к комнате пользователя
  socket.on('join_user', (userId) => {
    socket.join(`user_${userId}`);
  });

  // Отправка сообщения
  socket.on('send_message', async (data) => {
    try {
      const { leadId, message, senderId, senderType } = data;

      // Сохраняем сообщение в базе
      const { data: savedMessage, error } = await supabase
        .from('messages')
        .insert({
          lead_id: leadId,
          content: message,
          sender_id: senderId,
          sender_type: senderType
        })
        .select()
        .single();

      if (error) throw error;

      // Отправляем сообщение всем в комнате лида
      io.to(`lead_${leadId}`).emit('new_message', savedMessage);

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message_error', { error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
