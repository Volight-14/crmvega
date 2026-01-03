const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BUBBLE_USER_URL = 'https://vega-ex.com/api/1.1/obj/User';
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixClientNamesFromTg() {
    console.log('Fixing "Client <TG_ID>" names...');

    // 1. Find contacts with numeric names "Client 123..."
    // Regex match would be better but ILIKE 'Client %' + JS filter works
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, name')
        .ilike('name', 'Client %');

    if (error) {
        console.error('Error fetching contacts:', error);
        return;
    }

    // Filter for numeric only
    const numericContacts = contacts.filter(c => {
        const parts = c.name.split(' ');
        if (parts.length < 2) return false;
        const val = parts[1];
        return /^\d+$/.test(val); // Digits only
    });

    console.log(`Found ${numericContacts.length} contacts with numeric ID in name.`);

    let updatedCount = 0;
    let mergedCount = 0;
    let errorCount = 0;

    for (const contact of numericContacts) {
        try {
            const tgIdStr = contact.name.split(' ')[1];
            const tgId = parseInt(tgIdStr, 10);

            if (!tgId) continue;

            console.log(`Processing Contact ${contact.id} (TG: ${tgId})...`);

            // 1. Check for Duplicate by TG ID
            const { data: duplicate } = await supabase
                .from('contacts')
                .select('id')
                .eq('telegram_user_id', tgId)
                .neq('id', contact.id)
                .maybeSingle();

            if (duplicate) {
                console.log(`Duplicate found (ID: ${duplicate.id}). Merging...`);
                // Merge
                const { error: moveError } = await supabase
                    .from('orders')
                    .update({ contact_id: duplicate.id })
                    .eq('contact_id', contact.id);

                if (moveError) throw moveError;

                await supabase.from('contacts').delete().eq('id', contact.id);
                console.log(`Deleted source contact ${contact.id}`);
                mergedCount++;
                continue;
            }

            // 2. No duplicate, so this IS the contact.
            // Update its telegram_user_id
            await supabase.from('contacts').update({ telegram_user_id: tgId }).eq('id', contact.id);

            // 3. Fetch Info from Bubble to get Name
            let bUser = null;
            try {
                const response = await axios.get(BUBBLE_USER_URL, {
                    headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
                    params: {
                        constraints: JSON.stringify([
                            { key: 'TelegramID', constraint_type: 'equals', value: tgId }
                        ]),
                        limit: 1
                    }
                });
                if (response.data.response.results.length > 0) {
                    bUser = response.data.response.results[0];
                }
            } catch (err) {
                console.warn(`Error fetching user from Bubble for TG ${tgId}:`, err.message);
            }

            const updates = { telegram_user_id: tgId };

            if (bUser) {
                if (bUser.AmoName) {
                    updates.name = bUser.AmoName;
                } else if (bUser.FirstName) {
                    updates.name = `${bUser.FirstName} ${bUser.LastName || ''}`.trim();
                } else if (bUser.TelegramUsername) {
                    updates.name = `@${bUser.TelegramUsername}`;
                }

                updates.bubble_id = bUser._id;
                if (bUser.TelegramUsername) updates.telegram_username = bUser.TelegramUsername;
                if (bUser.authentication && bUser.authentication.email) updates.email = bUser.authentication.email.email;
                if (bUser.Date_LastOrder) updates.date_last_order = bUser.Date_LastOrder;
                if (bUser.TotalSumExchanges) updates.Total_Sum_Exchanges = bUser.TotalSumExchanges;
            }

            // Update
            const { error: updError } = await supabase
                .from('contacts')
                .update(updates)
                .eq('id', contact.id);

            if (updError) {
                // If update fails (e.g. duplicate email), we might need to merge by email?
                if (updError.message.includes('unique constraint')) {
                    console.warn(`Update failed due to unique constraint. Attempting merge by Email...`);
                    if (updates.email) {
                        const { data: dupEmail } = await supabase.from('contacts').select('id').eq('email', updates.email).neq('id', contact.id).maybeSingle();
                        if (dupEmail) {
                            // Merge into dupEmail
                            await supabase.from('orders').update({ contact_id: dupEmail.id }).eq('contact_id', contact.id);
                            await supabase.from('contacts').delete().eq('id', contact.id);
                            console.log(`Merged via Email into ${dupEmail.id}`);
                            mergedCount++;
                            continue;
                        }
                    }
                }
                console.error(`Failed to update ${contact.id}:`, updError.message);
                errorCount++;
            } else {
                updatedCount++;
            }

        } catch (err) {
            console.error(`Error processing ${contact.id}:`, err.message);
            errorCount++;
        }
    }

    console.log('Fix Complete.');
    console.log(`Merged: ${mergedCount}`);
    console.log(`Updated (Renamed): ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);
}

fixClientNamesFromTg();
