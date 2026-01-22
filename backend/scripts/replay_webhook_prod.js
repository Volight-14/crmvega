const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// URL for the actual server
const WEBHOOK_URL = 'https://crmvega-g766.onrender.com/api/webhook/bubble/order';
const TOKEN = 'b7ea74a3fcf7b7f9ac64df1d9b00e1cc';

const mainId = '1768499030099'; // New unique NUMERIC ID for testing

const payload = {
    "main_ID": mainId,
    "date": "Jan 15, 2026 2:00 am",
    "User": "715033350",
    "Uniqueid": "1768499029868x558623514303135740",
    "title": "Ночная  Сегодня 1000 USDT на 78300 RUB безнал",
    "SumInput": 1000,
    "CurrPair1": "USDT",
    "NetworkUSDT01": "TRC20",
    "NextDay": "Сегодня",
    "SumOutput": 78300,
    "CurrPair2": "RUB безнал",
    "BankRus02": "СБП",
    "PayeeName": "Тест",
    "Card_NumberOrSBP": "тест",
    "CashbackEUR": 0,
    "CashbackUSDT": 0,
    "Ordertime": "night",
    "OrderStatus": "Ночной",
    "SumPartly": 0,
    "OrderPaid": false
};

async function runTest() {
    console.log('--- Sending Webhook Request ---');
    try {
        const res = await axios.post(WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Token': TOKEN
            }
        });
        console.log('Status:', res.status);
        console.log('Response:', JSON.stringify(res.data, null, 2));

        // Now verification
        console.log('\n--- Verifying Database ---');
        // Give it a moment? Usually instant.

        const { data: order } = await supabase
            .from('orders')
            .select('id, contact_id, status, main_id')
            .eq('main_id', mainId)
            .single();

        if (!order) {
            console.log('FATAL: Order not created in DB!');
            return;
        }

        console.log(`Order Created: ID ${order.id}, Contact ID: ${order.contact_id}`);

        if (order.contact_id) {
            const { data: contact } = await supabase
                .from('contacts')
                .select('id, name, telegram_user_id')
                .eq('id', order.contact_id)
                .single();
            console.log('Linked Contact:', contact);

            if (contact && String(contact.telegram_user_id) === '715033350') {
                console.log('✅ SUCCESS: Linked to correct Telegram User!');
            } else {
                console.log('❌ FAIL: Linked to wrong contact (or User Unknown)');
            }
        } else {
            console.log('❌ FAIL: No contact linked');
        }

    } catch (err) {
        console.error('Request Error:', err.message);
        if (err.response) {
            console.error('Response Body:', err.response.data);
        }
    }
}

runTest();
