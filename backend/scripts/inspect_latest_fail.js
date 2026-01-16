require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function findLatestFail() {
    console.log('Searching for latest orders...');

    // Fetch orders created in the last 10 minutes
    const path10MinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: orders } = await supabase
        .from('orders')
        .select('id, main_id, contact_id, BubbleUser, created_at, contact:contacts(name)')
        .gt('created_at', path10MinAgo)
        .order('created_at', { ascending: false })
        .limit(5);

    console.log('Latest Orders:');

    for (const o of orders) {
        console.log(`Order ${o.main_id} (ID: ${o.id})`);
        console.log(`  BubbleUser: '${o.BubbleUser}'`);
        console.log(`  Contact: ${o.contact?.name} (ID: ${o.contact_id})`);

        // Check the BubbleUser field char codes in case of invisible junk
        if (o.BubbleUser) {
            const codes = [];
            for (let i = 0; i < o.BubbleUser.length; i++) codes.push(o.BubbleUser.charCodeAt(i));
            console.log(`  BubbleUser Codes: ${JSON.stringify(codes)}`);
        }
        console.log('---');
    }
}

findLatestFail();
