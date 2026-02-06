# VEG-64: Важная техническая информация

## Проблема с разбивкой по ордерам

### Симптом
Системное сообщение, созданное в одном ордере, появлялось во ВСЕХ ордерах пользователя.

### Причина

**В системе используется `main_id` для группировки ордеров одного пользователя:**
- `main_id` - общий ID для всех ордеров одного пользователя (одинаковый для всех)
- `id` - внутренний уникальный ID конкретного ордера

**Timeline API (`orderMessages.js`) загружает сообщения для ВСЕХ ордеров контакта:**

```javascript
// Находим ВСЕ ордера контакта
const { data: relatedOrders } = await supabase
  .from('orders')
  .select('id, main_id')
  .eq('contact_id', currentOrder.contact_id);

allOrderIds = relatedOrders.map(o => o.id); // [123, 456, 789, ...]

// Загружаем internal_messages для ВСЕХ этих ордеров
.from('internal_messages')
.in('order_id', allOrderIds) // ❌ Включает системные сообщения из всех ордеров!
```

Это сделано специально, чтобы **переписка менеджеров была видна во всех ордерах контакта**. Но системные уведомления должны быть только в конкретном ордере!

### Решение

Разделили запрос `internal_messages` на два:

#### 1. Обычные сообщения (для всех ордеров контакта)
```javascript
let regularInternalQuery = supabase
  .from('internal_messages')
  .in('order_id', allOrderIds) // Все ордера контакта
  .or('attachment_type.is.null,attachment_type.neq.system') // НЕ системные
```

#### 2. Системные сообщения (ТОЛЬКО текущий ордер)
```javascript
let systemMessagesQuery = supabase
  .from('internal_messages')
  .eq('order_id', parseInt(orderId)) // ТОЛЬКО текущий ордер!
  .eq('attachment_type', 'system') // Только системные
```

#### 3. Объединение
```javascript
const regularInternalMsgs = regularInternalRes.data || [];
const systemMsgs = systemMessagesRes.data || [];
const internalMsgs = [...regularInternalMsgs, ...systemMsgs];
```

### Результат

✅ **Обычные сообщения между менеджерами** - видны во всех ордерах контакта (как и должно быть)

✅ **Системные уведомления** - видны только в том ордере, где произошло действие

## Где применяется

Файл: `backend/routes/orderMessages.js`

Endpoint: `GET /api/orders/:orderId/messages/timeline`

Этот endpoint используется фронтендом для загрузки объединенной ленты сообщений (client + internal).
