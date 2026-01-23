
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config({ path: './backend/.env' });

const BUBBLE_API_URL = 'https://vega-ex.com/version-live/api/1.1/obj';
const TOKEN = 'b897577858b2a032515db52f77e15e38';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY is required.');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const headers = { Authorization: `Bearer ${TOKEN}` };

async function mergeDuplicates() {
    console.log('Starting Smart Merge (Batched, Verbose)...');

    // Get recent orders
    const { data: orders } = await supabase
        .from('orders')
        .select('contact_id, external_id')
        .not('external_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(300);

    const contactMap = {};
    orders.forEach(o => {
        if (!contactMap[o.contact_id]) contactMap[o.contact_id] = o.external_id;
    });

    const contactIds = Object.keys(contactMap);
    console.log(`Scanning ${contactIds.length} contacts from recent orders...`);

    let mergedCount = 0;

    for (let i = 0; i < contactIds.length; i++) {
        const contactId = contactIds[i];
        if (i % 20 === 0) console.log(`Processing ${i}/${contactIds.length}...`);

        const { data: contact } = await supabase.from('contacts').select('*').eq('id', contactId).single();
        if (!contact) continue;

        let tgId = null;
        try {
            const res = await axios.get(`${BUBBLE_API_URL}/Order/${contactMap[contactId]}`, { headers, timeout: 5000 });
            const bOrder = res.data.response;
            if (bOrder && bOrder.tg_amo) {
                const match = bOrder.tg_amo.match(/ID:\s*(\d+)/);
                if (match && match[1]) tgId = parseInt(match[1]);
            }
        } catch (e) {
            // console.log(`Error fetching bubble order ${contactMap[contactId]}: ${e.message}`);
            continue;
        }

        if (!tgId) continue;

        // Find original contact
        const { data: existing } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('telegram_user_id', tgId)
            .neq('id', contact.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (existing) {
            console.log(`⚡️ MERGE: "${contact.name}" (${contact.id}) -> "${existing.name}" (${existing.id})`);

            await supabase.from('orders').update({ contact_id: existing.id }).eq('contact_id', contact.id);
            await supabase.from('messages').update({ contact_id: existing.id }).eq('contact_id', contact.id);
            await supabase.from('contacts').delete().eq('id', contact.id);

            console.log(`   ✅ Success.`);
            mergedCount++;
        } else {
            // Update TG ID if missing
            if (!contact.telegram_user_id) {
                await supabase.from('contacts').update({ telegram_user_id: tgId }).eq('id', contact.id);
            }
        }
    }

    console.log('------------------------------------------------');
    console.log(`Merge Complete. Merged: ${mergedCount}`);
}

mergeDuplicates();
