require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const TOKEN = 'b897577858b2a032515db52f77e15e38';
const BASE_URL = 'https://vega-ex.com/version-live/api/1.1/obj';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function debugOrder(mainId) {
    console.log(`DEBUGGING ORDER: ${mainId}`);

    // 1. Fetch Order from Bubble
    try {
        const constraints = JSON.stringify([
            { key: 'main_ID', constraint_type: 'equals', value: String(mainId) }
        ]);
        console.log('Fetching Order from Bubble...');
        const res = await axios.get(`${BASE_URL}/Order`, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            params: { constraints }
        });

        const results = res.data.response.results;
        if (results.length === 0) {
            console.error('Order NOT FOUND in Bubble API.');
            return;
        }

        const order = results[0];
        console.log('--- Bubble Order Data ---');
        console.log('ID:', order._id);
        console.log('User Field:', order.User);

        // Check type of User field
        console.log('User Field Type:', typeof order.User);

        if (!order.User) {
            console.error('User field is MISSING or NULL in Bubble Order.');
            return;
        }

        // 2. Fetch User from Bubble
        console.log(`\nFetching User: ${order.User}...`);
        const userRes = await axios.get(`${BASE_URL}/User/${order.User}`, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });

        const user = userRes.data.response;
        console.log('--- Bubble User Data ---');
        console.log('TelegramID:', user.TelegramID);
        console.log('TelegramUsername:', user.TelegramUsername);
        console.log('AmoName:', user.AmoName);
        console.log('FirstName:', user.FirstName);
        console.log('LastName:', user.LastName);

    } catch (err) {
        console.error('API Error:', err.message);
        if (err.response) console.error(err.response.data);
    }
}

// target ID
debugOrder('1768496996937');
