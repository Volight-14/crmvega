require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function inspectNewOrder() {
    const mainId = '1768499030006';
    const expectedTgId = '715033350';

    console.log(`Inspecting Order: ${mainId}`);

    // 1. Fetch Order
    const { data: order } = await supabase
        .from('orders')
        .select('id, contact_id, BubbleUser, status, created_at')
        .eq('main_id', mainId)
        .maybeSingle();

    if (!order) {
        console.log('Order NOT found in DB.');
        return;
    }
    console.log('Order Data:', order);

    // 2. Fetch Linked Contact
    if (order.contact_id) {
        const { data: linked } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', order.contact_id)
            .maybeSingle();
        console.log('Linked Contact:', linked);
    } else {
        console.log('Order has NO contact_id.');
    }

    // 3. Search for contact with expected TG ID
    const { data: expectedContact } = await supabase
        .from('contacts')
        .select('*')
        .eq('telegram_user_id', expectedTgId)
        .maybeSingle();

    console.log(`Contact with TG ${expectedTgId}:`, expectedContact || 'NOT FOUND');
}

inspectNewOrder();
