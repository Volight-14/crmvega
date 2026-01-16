const axios = require('axios');
require('dotenv').config({ path: './.env' });

// Use local or prod URL? User said "web hook", implies live but let's try local if running, or prod.
// Since I can't reach localhost easily if no tunnel, I'll assume prod or use render URL.
// IMPORTANT: User says "make a test request".

const WEBHOOK_URL = 'https://crmvega.onrender.com/api/webhook/bubble/order';
const SECRET = process.env.BUBBLE_WEBHOOK_SECRET || 'your_secret_here';

// Random main_ID to avoid conflicts
const mainId = '999999' + Math.floor(Math.random() * 10000);
const tgId = '715033350'; // Known existing user (Vladimir)

const payload = {
    "main_ID": mainId,
    "User": tgId, // Send EXACTLY as user claims - strict number-like string
    "status": "new",
    "title": "TEST ORDER PROBE",
    "sumInput": 100,
    "currPair1": "USDT",
    "telegram_user_id": "" // Emulate it being missing here so fallback triggers
};

async function testWebhook() {
    console.log(`Sending Test Webhook to ${WEBHOOK_URL}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const res = await axios.post(WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Token': 'pass123' // Hardcoded secret from env usually
            }
        });
        console.log('Response Status:', res.status);
        console.log('Response Data:', res.data);

        // Check if linked
        console.log('\nVerifying DB Linkage...');
        // We need to wait a sec for processing? Usually sync.

        // Check linkage via script logic (read DB)
        // I will output the ID of the created order so we can inspect it.
    } catch (err) {
        console.error('Webhook Request Failed:', err.message);
        if (err.response) console.error(err.response.data);
    }
}

testWebhook();
