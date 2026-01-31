const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const router = express.Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Вебхук для Error Bot
router.post('/webhook', express.json(), async (req, res) => {
    // Telegram Update structure
    // { message: { chat: { id: ... }, text: ... } }
    // or { message: { ... } }

    try {
        const update = req.body;

        // Подтверждаем получение сразу
        res.json({ ok: true });

        if (!update.message || !update.message.chat) return;

        const chat = update.message.chat;
        const text = update.message.text || '';
        const userId = chat.id;

        if (text.startsWith('/start')) {
            // Сохраняем как подписчика
            const { data, error } = await supabase
                .from('error_subscribers')
                .upsert({
                    chat_id: String(userId),
                    first_name: chat.first_name || 'Admin',
                    username: chat.username || null,
                    created_at: new Date().toISOString()
                })
                .select();

            if (error) {
                console.error('[ErrorBot Webhook] Failed to save subscriber:', error);
            } else {
                console.log(`[ErrorBot Webhook] New subscriber: ${userId}`);

                // Отправляем приветствие (подтверждение)
                const ERROR_BOT_TOKEN = process.env.ERROR_BOT_TOKEN;
                if (ERROR_BOT_TOKEN) {
                    await axios.post(`https://api.telegram.org/bot${ERROR_BOT_TOKEN}/sendMessage`, {
                        chat_id: userId,
                        text: `✅ Подписка оформлена!\nТеперь вы будете получать уведомления о критических ошибках CRM (например, сбои при создании заявок).\n\nВаш ID: ${userId}`
                    }).catch(err => console.error('[ErrorBot Webhook] Reply error:', err.message));
                }
            }
        } else {
            // Игнорируем обычный текст
        }

    } catch (err) {
        console.error('[ErrorBot Webhook] Critical error:', err);
        // return res.status(500).send('Internal Error'); // No need, always 200 for webhook
    }
});

// Endpoint для настройки вебхука (одноразовый вызов)
router.get('/setup-webhook', async (req, res) => {
    const ERROR_BOT_TOKEN = process.env.ERROR_BOT_TOKEN;
    const WEBHOOK_URL = req.query.url; // Передайте URL публичного доступа

    if (!ERROR_BOT_TOKEN || !WEBHOOK_URL) {
        return res.status(400).send('Missing token or url query param');
    }

    try {
        const response = await axios.post(`https://api.telegram.org/bot${ERROR_BOT_TOKEN}/setWebhook`, {
            url: `${WEBHOOK_URL}/api/error-bot/webhook`
        });

        res.send(response.data);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

module.exports = router;
