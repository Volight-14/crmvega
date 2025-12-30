const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BUBBLE_API_URL = 'https://vega-ex.com/api/1.1/obj/User'; // User object
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function syncContacts() {
    console.log('Syncing Contact Names (Bubble -> CRM)...');

    // 1. Get contacts with Telegram ID
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, telegram_user_id, name')
        .not('telegram_user_id', 'is', null);

    if (error) {
        console.error('KB Error fetching contacts:', error);
        return;
    }

    console.log(`Found ${contacts.length} contacts with Telegram ID to check.`);

    let updatedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    for (const contact of contacts) {
        const tgId = String(contact.telegram_user_id);

        try {
            // 2. Search Bubble User by Telegram ID
            const response = await axios.get(BUBBLE_API_URL, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
                params: {
                    constraints: JSON.stringify([
                        { key: 'Telegram ID', constraint_type: 'equals', value: tgId }
                    ]),
                    limit: 1
                }
            });

            const results = response.data.response.results;

            if (results && results.length > 0) {
                const bUser = results[0];
                const amoName = bUser.AmoName;

                if (amoName && amoName !== contact.name) {
                    // 3. Update Name
                    const { error: updateError } = await supabase
                        .from('contacts')
                        .update({ name: amoName })
                        .eq('id', contact.id);

                    if (updateError) {
                        console.error(`[Contact ${contact.id}] Update failed:`, updateError.message);
                        errorCount++;
                    } else {
                        // console.log(`[Contact ${contact.id}] Updated: "${contact.name}" -> "${amoName}"`);
                        updatedCount++;
                    }
                } else {
                    // Name matches or empty in Bubble
                    // console.log(`[Contact ${contact.id}] No change needed.`);
                }

            } else {
                // console.log(`[Contact ${contact.id}] Telegram ID ${tgId} not found in Bubble.`);
                notFoundCount++;
            }

        } catch (err) {
            console.error(`[Contact ${contact.id}] Error:`, err.message);
            if (err.response && err.response.data) {
                console.error('Bubble Error:', JSON.stringify(err.response.data));
            }
            errorCount++;
        }
    }

    console.log('Sync Complete.');
    console.log(`Updated: ${updatedCount}`);
    console.log(`Not Found in Bubble: ${notFoundCount}`);
    console.log(`Errors: ${errorCount}`);
}

syncContacts();
