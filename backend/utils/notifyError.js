const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Функция для отправки ошибки всем подписчикам Error Bot
async function notifyErrorSubscribers(message) {
    const ERROR_BOT_TOKEN = process.env.ERROR_BOT_TOKEN;

    if (!ERROR_BOT_TOKEN) {
        console.error('[NotifyError] ERROR_BOT_TOKEN not set');
        return;
    }

    try {
        // 1. Получаем список подписчиков
        const { data: subscribers, error } = await supabase
            .from('error_subscribers')
            .select('chat_id');

        if (error) {
            console.error('[NotifyError] Error fetching subscribers:', error);
            return;
        }

        if (!subscribers || subscribers.length === 0) {
            console.warn('[NotifyError] No subscribers found to notify about error');
            return;
        }

        // 2. Рассылаем всем
        const sendPromises = subscribers.map(sub =>
            axios.post(`https://api.telegram.org/bot${ERROR_BOT_TOKEN}/sendMessage`, {
                chat_id: sub.chat_id,
                text: `⚠️ ОШИБКА:\n${message}`,
                parse_mode: 'HTML' // Simple HTML allowed
            }).catch(err => {
                console.error(`[NotifyError] Failed to send to ${sub.chat_id}:`, err.message);
            })
        );

        await Promise.all(sendPromises);
        console.log(`[NotifyError] Sent error notification to ${subscribers.length} admins`);

    } catch (err) {
        console.error('[NotifyError] Unexpected error:', err);
    }
}

module.exports = { notifyErrorSubscribers };
