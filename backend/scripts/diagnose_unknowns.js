const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BUBBLE_ORDER_URL = 'https://vega-ex.com/api/1.1/obj/Order';
const BUBBLE_USER_URL = 'https://vega-ex.com/api/1.1/obj/User';
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function diagnose() {
    console.log('Diagnosing "User Unknown" orders...\n');

    // 1. Get 10 sample unknown orders
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, main_id, contact_id, contacts!inner(name), created_at')
        .in('contacts.name', ['User Unknown', 'Client Unknown'])
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Found ${orders.length} sample unknown orders.\n`);

    for (const order of orders) {
        console.log(`--- Order ${order.main_id} (${order.created_at}) ---`);

        try {
            // Get Order from Bubble
            const orderResp = await axios.get(BUBBLE_ORDER_URL, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
                params: {
                    constraints: JSON.stringify([
                        { key: 'main_ID', constraint_type: 'equals', value: order.main_id }
                    ]),
                    limit: 1
                }
            });

            const bubbleOrder = orderResp.data.response.results[0];
            if (!bubbleOrder) {
                console.log(`[Result] Order NOT found in Bubble.`);
                continue;
            }

            console.log(`Bubble Order User Field: ${bubbleOrder.User}`);
            console.log(`Bubble Order MobilePhone: ${bubbleOrder.MobilePhone}`);
            console.log(`Bubble Order ClientName: ${bubbleOrder.ClientName}`);

            const bubbleUserId = bubbleOrder.User;
            if (!bubbleUserId) {
                console.log(`[Result] No User ID linked to order.`);
                continue;
            }

            // Get User from Bubble
            try {
                const userResp = await axios.get(`${BUBBLE_USER_URL}/${bubbleUserId}`, {
                    headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
                });
                const bubbleUser = userResp.data.response;

                console.log('Bubble User Data:');
                console.log(`  TelegramID: ${bubbleUser.TelegramID}`);
                console.log(`  Phone: ${bubbleUser.Phone || bubbleUser.MobilePhone}`);
                console.log(`  Email: ${bubbleUser.authentication?.email?.email}`);
                console.log(`  Name: ${bubbleUser.FirstName} ${bubbleUser.LastName}`);
                console.log(`  AmoName: ${bubbleUser.AmoName}`);

                if (!bubbleUser.TelegramID) {
                    console.log(`[FAIL REASON] User exists but has NO TelegramID.`);
                }
            } catch (err) {
                console.log(`[Result] User ${bubbleUserId} could NOT be fetched from Bubble (404/Error).`);
            }

        } catch (err) {
            console.error(`Error checking order: ${err.message}`);
        }
        console.log('\n');
    }
}

diagnose().catch(console.error);
