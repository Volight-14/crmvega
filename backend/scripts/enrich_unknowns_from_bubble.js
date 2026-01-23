
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config({ path: './backend/.env' });

const BUBBLE_API_URL = 'https://vega-ex.com/version-live/api/1.1/obj';
const TOKEN = 'b897577858b2a032515db52f77e15e38'; // From routes/bubble.js

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY is required.');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const headers = {
    Authorization: `Bearer ${TOKEN}`,
};

async function enrichUnknowns() {
    console.log('Starting enrichment of "User Unknown" contacts from Bubble...');

    // 1. Fetch contacts: "User Unknown" OR "User [digits]"
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, name')
        .ilike('name', 'User%'); // Matches "User Unknown", "User 12345", etc.

    if (error || !contacts) {
        console.error('Error fetching contacts:', error);
        return;
    }

    console.log(`Found ${contacts.length} "User ..." contacts. Checking Bubble...`);

    let updatedCount = 0;

    for (const contact of contacts) {
        // 2. Find ONE order with external_id (Bubble Order ID)
        const { data: order } = await supabase
            .from('orders')
            .select('id, external_id')
            .eq('contact_id', contact.id)
            .not('external_id', 'is', null)
            .limit(1)
            .maybeSingle();

        if (!order || !order.external_id) continue;

        try {
            const bubbleId = order.external_id;
            const res = await axios.get(`${BUBBLE_API_URL}/Order/${bubbleId}`, { headers, timeout: 5000 });
            const bOrder = res.data.response;

            if (bOrder) {
                let newName = bOrder.client_name;
                let tgUsername = null;
                let tgId = null;

                if (bOrder.tg_amo) {
                    // "anyagestalt, ID: 1132326159"
                    const parts = bOrder.tg_amo.split(',');
                    if (parts[0] && !parts[0].includes('ID:')) {
                        tgUsername = parts[0].trim();
                    }
                    const match = bOrder.tg_amo.match(/ID:\s*(\d+)/);
                    if (match && match[1]) tgId = parseInt(match[1]);
                }

                // Fallback name logic
                if (!newName && tgUsername) newName = tgUsername;

                const updates = {};
                if (tgId) updates.telegram_user_id = tgId;

                if (newName && newName !== 'Unknown') {
                    updates.name = `${newName}${tgUsername && newName !== tgUsername ? ` (@${tgUsername})` : ''}`;
                }

                if (Object.keys(updates).length > 0) {
                    const { error: upErr } = await supabase
                        .from('contacts')
                        .update(updates)
                        .eq('id', contact.id);

                    if (!upErr) {
                        console.log(`✅ Updated ${contact.id}: ${contact.name} -> ${updates.name || '(TG ID only)'}`);
                        updatedCount++;
                    }
                }
            }
        } catch (e) {
            // ignore errors
        }
        // await new Promise(r => setTimeout(r, 20));
    }

    console.log('------------------------------------------------');
    console.log(`Enrichment Complete. Updated: ${updatedCount}`);
}

enrichUnknowns();
