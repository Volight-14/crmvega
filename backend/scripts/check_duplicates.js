require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkDuplicates() {
    console.log('Checking for duplicate Telegram IDs...');

    const { data, error } = await supabase.rpc('get_duplicate_contacts');
    // Custom RPC likely doesn't exist, we have to do it manually or via raw SQL if we could.

    // Since we can't do group by having easily with JS client without loading all,
    // Let's load all contacts with telegram_user_id and counting in JS (inefficient but works for <10k)

    const { data: contacts, error: loadError } = await supabase
        .from('contacts')
        .select('id, name, telegram_user_id')
        .not('telegram_user_id', 'is', null)
        .limit(10000); // Hope it's enough

    if (loadError) {
        console.error(loadError);
        return;
    }

    const map = {};
    const duplicates = [];

    contacts.forEach(c => {
        const tid = String(c.telegram_user_id).trim(); // Normalize keys
        if (map[tid]) {
            duplicates.push({
                tg_id: tid,
                existing: map[tid],
                current: { id: c.id, name: c.name }
            });
        } else {
            map[tid] = { id: c.id, name: c.name };
        }
    });

    console.log(`checked ${contacts.length} contacts.`);
    if (duplicates.length > 0) {
        console.log('CRITICAL: Found duplicates!');
        console.log(JSON.stringify(duplicates, null, 2));
    } else {
        console.log('No duplicates found.');
    }
}

checkDuplicates();
