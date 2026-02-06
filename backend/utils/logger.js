const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Функция для логирования ошибок в таблицу logs
async function logError(source, message, details = {}, level = 'error') {
    try {
        const { error } = await supabase
            .from('logs')
            .insert({
                source: source, // e.g., 'telegram_bot', 'order_messages'
                message: message,
                details: details, // JSON object
                level: level, // 'error', 'info', 'warning'
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error('[Logger] Failed to write log to DB:', error);
        } // else succeeded
    } catch (err) {
        console.error('[Logger] Unexpected error writing log:', err);
    }
}

module.exports = { logError };
