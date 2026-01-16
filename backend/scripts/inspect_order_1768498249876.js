require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function inspect() {
    const mainId = '1768498249876';
    const telegramId = '6032278052';

    console.log(`Inspecting Order: ${mainId}`);

    // 1. Check Order
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, main_id, contact_id, BubbleUser, status, created_at')
        .eq('main_id', mainId)
        .maybeSingle();

    if (orderError) {
        console.error('Error fetching order:', orderError);
        return;
    }

    if (!order) {
        console.log('Order NOT FOUND');
        return;
    }

    console.log('Order Found:', order);

    // 2. Check Contact with the expected Telegram ID
    const { data: correctContact } = await supabase
        .from('contacts')
        .select('id, name, telegram_user_id, phone, status')
        .eq('telegram_user_id', telegramId)
        .maybeSingle();

    console.log(`Contact with TG ${telegramId}:`, correctContact);

    // 3. Inspect the contact actually linked to the order
    if (order.contact_id) {
        const { data: linkedContact } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', order.contact_id)
            .maybeSingle();
        console.log('Currently Linked Contact:', linkedContact);
    }
}

inspect();
