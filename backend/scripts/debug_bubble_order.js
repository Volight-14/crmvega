const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BUBBLE_API_URL = 'https://vega-ex.com/api/1.1/obj/Order';
const BUBBLE_USER_URL = 'https://vega-ex.com/api/1.1/obj/User';
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38'; // Copied from import_orders_today.js

const TARGET_MAIN_ID = '1768219817772';

async function debug() {
    console.log(`🔍 Searching Bubble for Order with main_ID = ${TARGET_MAIN_ID}...`);

    try {
        const constraints = JSON.stringify([
            { key: "main_ID", constraint_type: "equals", value: TARGET_MAIN_ID }
        ]);

        const response = await axios.get(BUBBLE_API_URL, {
            headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
            params: { constraints: constraints }
        });

        const results = response.data.response.results;

        if (results.length === 0) {
            console.log('❌ Order not found in Bubble by main_ID.');
            return;
        }

        const order = results[0];
        console.log('✅ Found Bubble Order:', order._id);
        console.log(`   - User Field: ${order.User}`);
        console.log(`   - ClientName: ${order.ClientName}`);
        console.log(`   - MobilePhone: ${order.MobilePhone}`);

        if (!order.User) {
            console.log('⚠️  Order has no User linked in Bubble.');
            return;
        }

        console.log(`🔍 Fetching User details for ${order.User}...`);
        try {
            const userResponse = await axios.get(`${BUBBLE_USER_URL}/${order.User}`, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
            });

            const user = userResponse.data.response;
            console.log('✅ Found Bubble User:');
            console.log(`   - TelegramID: ${user.TelegramID}`);
            console.log(`   - TelegramUsername: ${user.TelegramUsername}`);
            console.log(`   - FirstName: ${user.FirstName}`);
            console.log(`   - LastName: ${user.LastName}`);
            console.log(`   - AmoName: ${user.AmoName}`);

            if (!user.TelegramID) {
                console.log('❌ User exists but has NO TelegramID.');
            }

        } catch (uErr) {
            console.error('❌ Error fetching User from Bubble:', uErr.message);
        }

    } catch (error) {
        console.error('❌ Error querying Bubble Order:', error.message);
        if (error.response) console.error('   Data:', error.response.data);
    }
}

debug();
