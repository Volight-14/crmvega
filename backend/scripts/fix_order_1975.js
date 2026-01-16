require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixOrder1975() {
    const mainId = '1768499747685';
    const targetId = '715033350';
    const badContactId = 8834;

    console.log(`Fixing ${mainId}...`);

    // 1. Get correct contact
    const { data: vlad } = await supabase
        .from('contacts')
        .select('id')
        .eq('telegram_user_id', targetId)
        .single();

    if (!vlad) { console.error('Vladimir not found'); return; }

    // 2. Link
    await supabase.from('orders').update({ contact_id: vlad.id }).eq('main_id', mainId);
    console.log('Linked to Vladimir.');

    // 3. Delete Bad
    await supabase.from('contacts').delete().eq('id', badContactId);
    console.log('Deleted Bad Contact.');
}

fixOrder1975();
