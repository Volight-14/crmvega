const axios = require('axios');

const TOKEN = 'b897577858b2a032515db52f77e15e38';
const BASE_URL = 'https://vega-ex.com/version-live/api/1.1/obj';

async function inspect() {
    try {
        // 1. Fetch Order
        const mainId = '1768494602274';
        console.log(`Fetching Order with main_ID: ${mainId}...`);

        // Bubble constraint format
        const constraints = JSON.stringify([
            { key: 'main_ID', constraint_type: 'equals', value: mainId }
        ]);

        const orderRes = await axios.get(`${BASE_URL}/Order`, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            params: { constraints }
        });

        const results = orderRes.data.response.results;
        if (results.length === 0) {
            console.log('Order not found in Bubble.');
            return;
        }

        const order = results[0];
        console.log('--- Bubble Order ---');
        console.log('ID:', order._id);
        console.log('User Field:', order.User);
        console.log('Keys:', Object.keys(order));

        const userId = order.User;
        if (!userId) {
            console.log('No User field in order.');
            return;
        }

        // 2. Fetch User
        console.log(`\nFetching User: ${userId}...`);
        const userRes = await axios.get(`${BASE_URL}/User/${userId}`, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });

        const user = userRes.data.response;
        console.log('--- Bubble User ---');
        // Log all fields to identify Telegram ID and Contact info
        console.log(JSON.stringify(user, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
    }
}

inspect();
