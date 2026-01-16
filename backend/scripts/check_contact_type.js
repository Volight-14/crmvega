require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkSchema() {
    // We can't query information_schema easily via JS client mostly, 
    // but we can try to fetch a row and see the type or use RPC if available.
    // Actually, easiest is to just select one valid contact and check typeof.

    const { data, error } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .not('telegram_user_id', 'is', null)
        .limit(1);

    if (error) {
        console.error(error);
        return;
    }

    if (data.length > 0) {
        console.log('Sample Data:', data[0]);
        console.log('Type of telegram_user_id in JS:', typeof data[0].telegram_user_id);
    } else {
        console.log('No contacts with telegram_user_id found');
    }
}

checkSchema();
