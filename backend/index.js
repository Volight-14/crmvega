const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const server = createServer(app);
const getAllowedOrigins = () => {
  const origins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'https://crmvega.vercel.app'
  ].filter(Boolean);
  return origins;
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = getAllowedOrigins();
      if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (например, мобильные приложения, Postman)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'https://crmvega.vercel.app',
      'https://*.vercel.app'
    ].filter(Boolean);

    // Проверяем точное совпадение или домены Vercel
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());

// Сохраняем io в app для доступа из routes
app.set('io', io);

// Routes
app.use('/api/auth', require('./routes/auth'));
// app.use('/api/leads', require('./routes/leads')); // Removed: leads table deprecated
app.use('/api/chats', require('./routes/chats'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/bot', require('./routes/bot'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/deals', require('./routes/deals'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/webhook/bubble', require('./routes/bubble'));
app.use('/api/deal-messages', require('./routes/dealMessages'));

// Логирование всех зарегистрированных роутов
console.log('✅ Routes registered:');
console.log('  - /api/webhook/bubble');

// Socket.IO для real-time общения
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Присоединение к комнате пользователя
  socket.on('join_user', (userId) => {
    socket.join(`user_${userId}`);
  });

  // Присоединение к комнате заявки
  socket.on('join_lead', (leadId) => {
    socket.join(`lead_${leadId}`);
  });

  // Присоединение к комнате сделки
  socket.on('join_deal', (dealId) => {
    socket.join(`deal_${dealId}`);
    console.log(`Socket ${socket.id} joined deal_${dealId}`);
  });

  // Выход из комнаты сделки
  socket.on('leave_deal', (dealId) => {
    socket.leave(`deal_${dealId}`);
  });

  // Присоединение к комнате контакта
  socket.on('join_contact', (contactId) => {
    socket.join(`contact_${contactId}`);
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

  socket.on('disconnect', (reason) => {
    console.log('❌ User disconnected:', socket.id, 'reason:', reason);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
