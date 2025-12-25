# Интеграция с Bubble Webhook для изменения статусов

## Описание
При изменении статуса заявки в CRM автоматически отправляется вебхук на Bubble.

## Endpoint Bubble
```
POST https://vegaexchanges.bubbleapps.io/version-live/api/1.1/wf/wh_order2/
```

## Формат данных
```json
{
  "leads": {
    "status": [
      {
        "id": "1234567890123",           // main_id заявки
        "status_id": "75360614",         // Новый Bubble ID статуса
        "old_status_id": "69707910",     // Старый Bubble ID статуса
        "last_modified": "1735140087"    // Unix timestamp (секунды)
      }
    ]
  }
}
```

## Маппинг статусов

| Внутренний статус | Bubble ID | Название |
|------------------|-----------|----------|
| unsorted | 68464454 | Неразобранное |
| accepted_anna | 68464458 | Принято Анна |
| accepted_kostya | 68626790 | Принято Костя |
| accepted_stas | 68627678 | Принято Стас |
| in_progress | 71445094 | Работа с клиентом |
| survey | 75360614 | Опрос |
| transferred_nikita | 68464462 | Передано Никите |
| transferred_val | 69674402 | Передано Вал Александру |
| transferred_ben | 68626794 | Передано Бен Александру |
| transferred_fin | 74741370 | Передано Фин Александру |
| partially_completed | 68624190 | Частично исполнена |
| postponed | 68464466 | Перенос на завтра |
| client_rejected | 70835430 | Отказ клиента |
| scammer | 70836166 | Мошенник |
| moderation | 69707910 | На модерации |
| completed | 142 | Успешно реализована |

## Как это работает

1. **Изменение статуса**: При обновлении заявки через `PATCH /api/orders/:id` с полем `status`
2. **Получение старого статуса**: Система получает текущий статус заявки из БД
3. **Обновление заявки**: Статус обновляется в Supabase
4. **Отправка вебхука**: Асинхронно отправляется POST-запрос на Bubble с:
   - `main_id` заявки
   - Новым и старым Bubble ID статусов
   - Текущим timestamp

## Повторные попытки

- **Количество попыток**: 3
- **Задержка**: Экспоненциальная (1с, 2с, 4с)
- **Таймаут**: 10 секунд на запрос

## Логирование

Все события логируются с префиксом `[Bubble Webhook]`:
- ✅ Успешная отправка
- ❌ Ошибки с деталями
- ⚠️ Предупреждения (например, отсутствие main_id)

## Примеры логов

### Успешная отправка
```
[Bubble Webhook] Sending status change: {
  mainId: 1735140087123,
  oldStatus: 'moderation (69707910)',
  newStatus: 'survey (75360614)',
  timestamp: '2025-12-25T15:41:27.000Z',
  payload: { ... }
}
[Bubble Webhook] ✅ Success (attempt 1/3): {
  mainId: 1735140087123,
  status: 200,
  data: { ... }
}
```

### Ошибка с повторными попытками
```
[Bubble Webhook] ❌ Error (attempt 1/3): {
  mainId: 1735140087123,
  error: 'Network Error',
  response: undefined,
  status: undefined
}
[Bubble Webhook] Retrying in 1000ms...
```

## Тестирование

Для тестирования можно обновить статус заявки через API:

```bash
curl -X PATCH http://localhost:3001/api/orders/123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"status": "survey"}'
```

Проверьте логи backend для подтверждения отправки вебхука.
