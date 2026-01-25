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
// Custom JSON parser to handle Bubble's invalid JSON (unquoted yes/no)
app.use(express.text({ type: 'application/json' }));
app.use(require('./middleware/json5Parser')); // Use JSON5 for loose parsing

// Сохраняем io в app для доступа из routes
app.set('io', io);

// Routes
app.use('/api/auth', require('./routes/auth'));
// app.use('/api/chats', require('./routes/chats')); // Removed
app.use('/api/messages', require('./routes/messages'));
app.use('/api/bot', require('./routes/bot'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/orders', require('./routes/orders')); // Renamed from deals
app.use('/api/notes', require('./routes/notes'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/managers', require('./routes/managers'));
app.use('/api/webhook/bubble', require('./routes/bubble'));
app.use('/api/order-messages', require('./routes/orderMessages')); // Renamed from deal-messages
app.use('/api/tags', require('./routes/tags'));
app.use('/api/upload', require('./routes/upload'));

// Логирование всех зарегистрированных роутов
console.log('✅ Routes registered:');
console.log('  - /api/webhook/bubble');
console.log('  - /api/orders');
console.log('  - /api/order-messages');


// Socket.IO для real-time общения
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Присоединение к комнате пользователя
  socket.on('join_user', (userId) => {
    socket.join(`user_${userId}`);
  });

  // Присоединение к комнате заявки
  // Formerly join_lead, but if we assume 'lead' is 'order'...
  // Keeping join_lead for legacy compatibility if messages use it?
  // Messages use lead_id. 
  socket.on('join_lead', (leadId) => {
    socket.join(`lead_${leadId}`);
  });

  // Присоединение к комнате ордера (бывшая сделка)
  socket.on('join_order', (orderId) => {
    socket.join(`order_${orderId}`);
    console.log(`Socket ${socket.id} joined order_${orderId}`);
  });

  // Выход из комнаты ордера
  socket.on('leave_order', (orderId) => {
    socket.leave(`order_${orderId}`);
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

      // Отправляем сообщение всем в комнате лида (main_id)
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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('🔥 Global Error Handler:', err);
  console.error('Stack:', err.stack);

  // Ensure JSON response
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
