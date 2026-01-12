const axios = require('axios');

// Обратный маппинг: внутренний статус -> Bubble status_id
const STATUS_TO_BUBBLE_ID = {
    'unsorted': '68464454',
    'accepted_anna': '68464458',
    'accepted_kostya': '68626790',
    'accepted_stas': '68627678',
    'accepted_lucy': '80739506',
    'in_progress': '71445094',
    'survey': '75360614',
    'transferred_nikita': '68464462',
    'transferred_val': '69674402',
    'transferred_ben': '68626794',
    'transferred_fin': '74741370',
    'partially_completed': '68624190',
    'postponed': '68464466',
    'client_rejected': '70835430',
    'scammer': '70836166',
    'moderation': '69707910',
    'completed': '142',
    'duplicate': '143'
};

/**
 * Отправляет вебхук на Bubble при изменении статуса заявки
 * @param {Object} params - Параметры вебхука
 * @param {string|number} params.mainId - main_id заявки
 * @param {string} params.newStatus - Новый внутренний статус
 * @param {string} params.oldStatus - Старый внутренний статус
 * @param {number} params.retries - Количество попыток (по умолчанию 3)
 */
async function sendBubbleStatusWebhook({ mainId, newStatus, oldStatus, retries = 3 }) {
    const webhookUrl = 'https://vegaexchanges.bubbleapps.io/version-live/api/1.1/wf/wh_order2/';

    // Получаем Bubble ID для статусов
    const newStatusId = STATUS_TO_BUBBLE_ID[newStatus];
    const oldStatusId = STATUS_TO_BUBBLE_ID[oldStatus];

    // Если статус не найден в маппинге, логируем предупреждение
    if (!newStatusId) {
        console.warn(`[Bubble Webhook] Unknown status mapping for: ${newStatus}`);
        return { success: false, error: 'Unknown status mapping' };
    }

    // Формируем payload
    const payload = {
        leads: {
            status: [
                {
                    id: String(mainId),
                    status_id: newStatusId,
                    old_status_id: oldStatusId || newStatusId, // Если старого нет, используем новый
                    last_modified: String(Math.floor(Date.now() / 1000)) // Unix timestamp в секундах
                }
            ]
        }
    };

    console.log('[Bubble Webhook] Sending status change:', {
        mainId,
        oldStatus: `${oldStatus} (${oldStatusId})`,
        newStatus: `${newStatus} (${newStatusId})`,
        timestamp: new Date().toISOString(),
        payload
    });

    // Попытки отправки с повторами
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios.post(webhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 секунд таймаут
            });

            console.log(`[Bubble Webhook] ✅ Success (attempt ${attempt}/${retries}):`, {
                mainId,
                status: response.status,
                data: response.data
            });

            return { success: true, response: response.data };

        } catch (error) {
            const isLastAttempt = attempt === retries;

            console.error(`[Bubble Webhook] ❌ Error (attempt ${attempt}/${retries}):`, {
                mainId,
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            if (isLastAttempt) {
                console.error(`[Bubble Webhook] Failed after ${retries} attempts for main_id: ${mainId}`);
                return {
                    success: false,
                    error: error.message,
                    details: error.response?.data
                };
            }

            // Ждем перед следующей попыткой (экспоненциальная задержка)
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // max 5 секунд
            console.log(`[Bubble Webhook] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Обратный маппинг: Bubble status_id -> внутренний статус
const BUBBLE_ID_TO_STATUS = Object.entries(STATUS_TO_BUBBLE_ID).reduce((acc, [key, value]) => {
    acc[value] = key;
    return acc;
}, {});

module.exports = { sendBubbleStatusWebhook, STATUS_TO_BUBBLE_ID, BUBBLE_ID_TO_STATUS };
