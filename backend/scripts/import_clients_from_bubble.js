const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BUBBLE_API_URL = 'https://vega-ex.com/api/1.1/obj/User';
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38';
const PAGE_SIZE = 100;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function importClients() {
    console.log('Importing Clients from Bubble...');

    let cursor = 0;
    let hasMore = true;
    let totalProcessed = 0;
    let updatedCount = 0;
    let createdCount = 0;
    let errorCount = 0;

    while (hasMore) {
        try {
            // Fetch page
            const response = await axios.get(BUBBLE_API_URL, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
                params: {
                    constraints: JSON.stringify([
                        { key: 'Role', constraint_type: 'equals', value: 'Client' }
                    ]),
                    limit: PAGE_SIZE,
                    cursor: cursor
                }
            });

            const results = response.data.response.results;
            const count = response.data.response.count; // Total count for query? Or returned?
            const remaining = response.data.response.remaining;

            if (results.length === 0) {
                hasMore = false;
                break;
            }

            console.log(`Fetched ${results.length} clients (Cursor: ${cursor})...`);

            // Process batch
            for (const bUser of results) {

                // Data Extraction
                const telegramId = bUser.TelegramID ? String(bUser.TelegramID) : null;
                let email = null;
                if (bUser.authentication && bUser.authentication.email) {
                    email = bUser.authentication.email.email;
                }

                const contactData = {
                    name: bUser.AmoName || `Client ${telegramId || email || 'Unknown'}`,
                    telegram_user_id: telegramId ? parseInt(telegramId) : null,
                    telegram_username: bUser.TelegramUsername,
                    first_name: bUser.FirstName,
                    last_name: bUser.LastName,
                    email: email,
                    date_last_order: bUser.Date_LastOrder,
                    Total_Sum_Exchanges: bUser.TotalSumExchanges,
                    bubble_id: bUser._id,
                };

                // Matching Logic
                // Priority 1: Match by telegram_user_id
                let match = null;

                if (contactData.telegram_user_id) {
                    const { data: existingTg } = await supabase
                        .from('contacts')
                        .select('id')
                        .eq('telegram_user_id', contactData.telegram_user_id)
                        .maybeSingle();
                    match = existingTg;
                }

                // Priority 2: Match by bubble_id (if we already synced some)
                if (!match && contactData.bubble_id) {
                    const { data: existingBid } = await supabase
                        .from('contacts')
                        .select('id')
                        .eq('bubble_id', contactData.bubble_id)
                        .maybeSingle();
                    match = existingBid;
                }

                // Priority 3: Match by email (optional, if trusted)
                /*
                if (!match && contactData.email) {
                     const { data: existingEmail } = await supabase
                        .from('contacts')
                        .select('id')
                        .eq('email', contactData.email)
                        .maybeSingle();
                     match = existingEmail;
                }
                */

                if (match) {
                    // Update
                    const { error: updError } = await supabase
                        .from('contacts')
                        .update(contactData)
                        .eq('id', match.id);

                    if (updError) {
                        console.error(`Failed to update contact ${match.id}:`, updError.message);
                        errorCount++;
                    } else {
                        updatedCount++;
                    }
                } else {
                    // Create
                    // Ensure status is active
                    contactData.status = 'active';
                    contactData.created_at = bUser['Created Date']; // Use original creation date

                    const { error: insError } = await supabase
                        .from('contacts')
                        .insert(contactData);

                    if (insError) {
                        console.error(`Failed to create contact for Bubble ID ${bUser._id}:`, insError.message);
                        errorCount++;
                    } else {
                        createdCount++;
                    }
                }
            }

            totalProcessed += results.length;
            cursor += PAGE_SIZE;

            if (remaining === 0) {
                hasMore = false;
            }

        } catch (err) {
            console.error('Import Loop Error:', err.message);
            // Break or retry? Break to avoid infinite loop
            hasMore = false;
        }
    }

    console.log('Import Clients Complete.');
    console.log(`Total Processed: ${totalProcessed}`);
    console.log(`Created: ${createdCount}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);
}

importClients();
