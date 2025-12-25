/**
 * Тестовый скрипт для проверки отправки вебхука на Bubble
 * Использование: node test-bubble-webhook.js
 */

require('dotenv').config();
const { sendBubbleStatusWebhook } = require('./utils/bubbleWebhook');

async function testWebhook() {
    console.log('🧪 Тестирование отправки вебхука на Bubble...\n');

    // Тестовые данные
    const testData = {
        mainId: 1735140087123, // Тестовый main_id
        newStatus: 'survey',
        oldStatus: 'moderation'
    };

    console.log('📤 Отправка тестового вебхука с данными:');
    console.log(JSON.stringify(testData, null, 2));
    console.log('');

    try {
        const result = await sendBubbleStatusWebhook(testData);

        if (result.success) {
            console.log('\n✅ Тест успешно пройден!');
            console.log('Ответ от Bubble:', result.response);
        } else {
            console.log('\n❌ Тест провален');
            console.log('Ошибка:', result.error);
            if (result.details) {
                console.log('Детали:', result.details);
            }
        }
    } catch (error) {
        console.error('\n💥 Неожиданная ошибка:', error.message);
    }
}

// Запуск теста
testWebhook();
