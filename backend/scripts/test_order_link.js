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

async function testOrderLink() {
    const mainId = '1767427300751';

    console.log(`Testing order ${mainId}...`);

    // 1. Get Order
    const orderResp = await axios.get(BUBBLE_ORDER_URL, {
        headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
        params: {
            constraints: JSON.stringify([{ key: 'main_ID', constraint_type: 'equals', value: mainId }]),
            limit: 1
        }
    });

    const order = orderResp.data.response.results[0];
    console.log('Order User:', order.User);

    // 2. Get User
    const userResp = await axios.get(`${BUBBLE_USER_URL}/${order.User}`, {
        headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
    });

    const user = userResp.data.response;
    console.log('User TelegramID:', user.TelegramID);
    console.log('User AmoName:', user.AmoName);

    // 3. Find contact
    const { data: contact } = await supabase
        .from('contacts')
        .select('id, name, telegram_user_id')
        .eq('telegram_user_id', user.TelegramID)
        .maybeSingle();

    console.log('Found contact:', contact);

    // 4. Check current order link
    const { data: currentOrder } = await supabase
        .from('orders')
        .select('id, contact_id, main_id')
        .eq('main_id', mainId)
        .single();

    console.log('Current order contact_id:', currentOrder.contact_id);
    console.log('Should be:', contact?.id);
    console.log('Match:', currentOrder.contact_id === contact?.id ? '✓' : '✗');
}

testOrderLink().catch(console.error);
