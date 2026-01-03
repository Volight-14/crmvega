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

async function fixClientNames() {
    console.log('Fixing "Client 17...x..." names by fetching Bubble User...');

    // 1. Find contacts with Bubble System ID in name
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, name')
        .ilike('name', 'Client 17%x%'); // Matches "Client 17...x..."

    if (error) {
        console.error('Error fetching contacts:', error);
        return;
    }

    console.log(`Found ${contacts.length} contacts with Bubble ID in name.`);

    let updatedCount = 0;
    let errorCount = 0;
    let notFoundInBubble = 0;

    for (const contact of contacts) {
        try {
            // Extract ID: "Client 172...x..." -> "172...x..."
            const parts = contact.name.split(' ');
            if (parts.length < 2) continue;

            const bubbleId = parts[1]; // Assuming format "Client ID"

            if (!bubbleId.includes('x')) {
                console.log(`Skipping likely non-ID name: ${contact.name}`);
                continue;
            }

            // 2. Fetch User from Bubble
            let bUser = null;
            try {
                const response = await axios.get(`${BUBBLE_USER_URL}/${bubbleId}`, {
                    headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
                });
                bUser = response.data.response;
            } catch (err) {
                if (err.response && err.response.status === 404) {
                    // Try searching by _id constraint if direct fetch fails? No, direct fetch by ID should work.
                    // Maybe it's not a user ID but an Order ID?
                    // Import logic used Order.User as the Name if name missing.
                    // So it SHOULD be a User ID.
                    console.warn(`Bubble ID ${bubbleId} not found (404). Maybe it was deleted?`);
                    notFoundInBubble++;
                } else {
                    throw err;
                }
            }

            if (bUser) {
                // 3. Update Contact
                // 3. Update Contact
                // (Logic moved below to handle merge first)


                let targetId = contact.id;
                let shouldDeleteOrigin = false;

                // Check for duplicates by Telegram ID or Email
                let duplicateId = null;

                if (bUser.TelegramID) {
                    const { data: dupTg } = await supabase.from('contacts').select('id').eq('telegram_user_id', bUser.TelegramID).neq('id', contact.id).maybeSingle();
                    if (dupTg) duplicateId = dupTg.id;
                }

                if (!duplicateId && bUser.authentication && bUser.authentication.email) {
                    const { data: dupEmail } = await supabase.from('contacts').select('id').eq('email', bUser.authentication.email.email).neq('id', contact.id).maybeSingle();
                    if (dupEmail) duplicateId = dupEmail.id;
                }

                if (duplicateId) {
                    console.log(`Duplicate found for ${contact.name} (${contact.id}) -> Target: ${duplicateId}. Merging...`);
                    // MERGE
                    const { error: moveError } = await supabase
                        .from('orders')
                        .update({ contact_id: duplicateId })
                        .eq('contact_id', contact.id);

                    if (moveError) {
                        console.error(`Error moving orders from ${contact.id} to ${duplicateId}:`, moveError.message);
                        errorCount++;
                        continue;
                    }

                    // Mark for deletion
                    targetId = duplicateId;
                    shouldDeleteOrigin = true;
                }

                // Prepare updates for the Target (either self or the duplicate)
                const updates = {
                    bubble_id: bubbleId
                };
                if (bUser.AmoName) updates.name = bUser.AmoName;
                else if (bUser.FirstName) updates.name = `${bUser.FirstName} ${bUser.LastName || ''}`.trim();

                if (bUser.TelegramID) updates.telegram_user_id = bUser.TelegramID;
                if (bUser.TelegramUsername) updates.telegram_username = bUser.TelegramUsername;
                if (bUser.Date_LastOrder) updates.date_last_order = bUser.Date_LastOrder;
                if (bUser.TotalSumExchanges) updates.Total_Sum_Exchanges = bUser.TotalSumExchanges;
                if (bUser.authentication && bUser.authentication.email) updates.email = bUser.authentication.email.email;

                // If we are merging, we don't need to check for duplicates again on the target (unless target has issues)
                // But if we are NOT merging (targetId == contact.id), we might hit conflicts if we didn't catch them above.

                const { error: updError } = await supabase
                    .from('contacts')
                    .update(updates)
                    .eq('id', targetId);

                if (updError) {
                    console.error(`Failed to update target contact ${targetId}:`, updError.message);
                    errorCount++;
                } else {
                    updatedCount++;
                    if (shouldDeleteOrigin) {
                        await supabase.from('contacts').delete().eq('id', contact.id);
                        console.log(`Deleted source contact ${contact.id}`);
                    }
                }
            }

        } catch (err) {
            console.error(`Error processing ${contact.id}:`, err.message);
            errorCount++;
        }
    }

    console.log('Fix Complete.');
    console.log(`Updated: ${updatedCount}`);
    console.log(`Not Found in Bubble: ${notFoundInBubble}`);
    console.log(`Errors: ${errorCount}`);
}

fixClientNames();
