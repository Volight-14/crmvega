require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function inspectDates() {
    const mainId = '1768498249876';

    const { data: order } = await supabase
        .from('orders')
        .select('created_at, contact_id')
        .eq('main_id', mainId)
        .single();

    const { data: contact } = await supabase
        .from('contacts')
        .select('id, created_at, telegram_user_id')
        .eq('id', 6494) // Valid contact
        .single();

    console.log(`Order Created At:   ${order.created_at}`);
    console.log(`Contact Created At: ${contact.created_at}`);

    if (new Date(contact.created_at) > new Date(order.created_at)) {
        console.log('Contact was created AFTER the order.');
    } else {
        console.log('Contact existed BEFORE the order.');
    }
}

inspectDates();
