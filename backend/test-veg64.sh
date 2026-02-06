#!/bin/bash

# VEG-64 Testing Script
# Тестирование новых webhook endpoints

BACKEND_URL="https://crmvega-g766.onrender.com"
WEBHOOK_TOKEN="your_webhook_token_here"  # Замени на реальный токен из .env

echo "🧪 VEG-64 Testing Script"
echo "======================="
echo ""

# Test 1: Check endpoints availability
echo "📋 Test 1: Checking endpoints availability..."
curl -s "$BACKEND_URL/api/webhook/bubble" | python3 -m json.tool
echo ""
echo "✅ Test 1 completed"
echo ""

# Test 2: note_to_user endpoint
echo "📋 Test 2: Testing note_to_user endpoint..."
echo "Request:"
cat << EOF
{
  "user": "123456789",
  "note": "Тестовая заметка для всех ордеров пользователя"
}
EOF
echo ""
echo "Response:"
curl -X POST "$BACKEND_URL/api/webhook/bubble/note_to_user" \
  -H "X-Webhook-Token: $WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "123456789",
    "note": "Тестовая заметка для всех ордеров пользователя"
  }' | python3 -m json.tool
echo ""
echo "✅ Test 2 completed"
echo ""

# Test 3: note_to_order endpoint
echo "📋 Test 3: Testing note_to_order endpoint..."
echo "Request:"
cat << EOF
{
  "main_id": "1769873416276",
  "note": "Тестовая заметка для конкретного ордера"
}
EOF
echo ""
echo "Response:"
curl -X POST "$BACKEND_URL/api/webhook/bubble/note_to_order" \
  -H "X-Webhook-Token: $WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "main_id": "1769873416276",
    "note": "Тестовая заметка для конкретного ордера"
  }' | python3 -m json.tool
echo ""
echo "✅ Test 3 completed"
echo ""

echo "🎉 All tests completed!"
echo ""
echo "⚠️  Примечание:"
echo "- Замени WEBHOOK_TOKEN на реальный токен из .env"
echo "- Замени user и main_id на реальные значения из БД"
echo "- Проверь служебные сообщения в UI после выполнения тестов"
