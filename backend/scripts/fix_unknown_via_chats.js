const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BUBBLE_CHAT_URL = 'https://vega-ex.com/api/1.1/obj/Chats Messages';
const BUBBLE_USER_URL = 'https://vega-ex.com/api/1.1/obj/User';
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixUnknownViaChats() {
    console.log('Fixing Unknown contacts via Chats Messages...');

    // 1. Find Unknown contacts with orders
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, name')
        .in('name', ['User Unknown', 'Client Unknown']);

    if (error) {
        console.error('Error fetching contacts:', error);
        return;
    }

    console.log(`Found ${contacts.length} Unknown contacts.`);

    let updatedCount = 0;
    let deletedCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;

    for (const contact of contacts) {
        try {
            // 2. Get order for this contact
            const { data: orders } = await supabase
                .from('orders')
                .select('id, main_id')
                .eq('contact_id', contact.id)
                .limit(1);

            if (!orders || orders.length === 0) {
                // No orders - safe to delete
                await supabase.from('contacts').delete().eq('id', contact.id);
                console.log(`Deleted empty contact ${contact.id}`);
                deletedCount++;
                continue;
            }

            const mainId = orders[0].main_id;
            console.log(`Processing Contact ${contact.id} (Order main_id: ${mainId})...`);

            // 3. Find Chat Message _id by main_ID
            const searchResponse = await axios.get(BUBBLE_CHAT_URL, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
                params: {
                    constraints: JSON.stringify([
                        { key: 'main_ID', constraint_type: 'equals', value: mainId }
                    ]),
                    limit: 1
                }
            });

            const searchResults = searchResponse.data.response.results;
            if (searchResults.length === 0) {
                console.warn(`No chat message found for main_id ${mainId}`);
                notFoundCount++;
                continue;
            }

            const chatMessageId = searchResults[0]._id;

            // 4. Fetch full message by _id to get User field
            const fullMessageResponse = await axios.get(`${BUBBLE_CHAT_URL}/${chatMessageId}`, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
            });

            const chatMsg = fullMessageResponse.data.response;

            // Try to get User field from chat message
            let bubbleUserId = chatMsg.user || chatMsg.User;

            // Fallback: If no user in chat, get it from Order
            if (!bubbleUserId) {
                console.log(`No user in chat message, trying Order for main_ID ${mainId}...`);
                try {
                    const BUBBLE_ORDER_URL = 'https://vega-ex.com/api/1.1/obj/Order';
                    const orderResponse = await axios.get(BUBBLE_ORDER_URL, {
                        headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
                        params: {
                            constraints: JSON.stringify([
                                { key: 'main_ID', constraint_type: 'equals', value: mainId }
                            ]),
                            limit: 1
                        }
                    });
                    const orders = orderResponse.data.response.results;
                    if (orders.length > 0) {
                        bubbleUserId = orders[0].User;
                        if (bubbleUserId) {
                            console.log(`Found user from Order: ${bubbleUserId}`);
                        }
                    }
                } catch (err) {
                    console.warn(`Could not get user from Order ${mainId}:`, err.message);
                }
            }

            if (!bubbleUserId) {
                console.warn(`No user found for main_id ${mainId} (tried chat and order)`);
                notFoundCount++;
                continue;
            }

            console.log(`Found user: ${bubbleUserId} for main_id ${mainId}`);

            // 5. Fetch User details
            let bUser = null;
            try {
                const userResponse = await axios.get(`${BUBBLE_USER_URL}/${bubbleUserId}`, {
                    headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
                });
                bUser = userResponse.data.response;
            } catch (err) {
                console.warn(`User ${bubbleUserId} not found in Bubble:`, err.message);
                notFoundCount++;
                continue;
            }

            // 5. Check for duplicate by TG ID or Email
            let duplicateId = null;

            if (bUser.TelegramID) {
                const { data: dupTg } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('telegram_user_id', bUser.TelegramID)
                    .neq('id', contact.id)
                    .maybeSingle();
                if (dupTg) duplicateId = dupTg.id;
            }

            if (!duplicateId && bUser.authentication && bUser.authentication.email) {
                const { data: dupEmail } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('email', bUser.authentication.email.email)
                    .neq('id', contact.id)
                    .maybeSingle();
                if (dupEmail) duplicateId = dupEmail.id;
            }

            if (duplicateId) {
                // MERGE
                console.log(`Duplicate found (${duplicateId}). Merging...`);
                await supabase
                    .from('orders')
                    .update({ contact_id: duplicateId })
                    .eq('contact_id', contact.id);

                await supabase.from('contacts').delete().eq('id', contact.id);
                console.log(`Merged ${contact.id} into ${duplicateId}`);
                updatedCount++;
                continue;
            }

            // 6. Update this contact with User data
            const updates = {
                bubble_id: bubbleUserId
            };

            if (bUser.AmoName) {
                updates.name = bUser.AmoName;
            } else if (bUser.FirstName) {
                updates.name = `${bUser.FirstName} ${bUser.LastName || ''}`.trim();
            } else if (bUser.TelegramUsername) {
                updates.name = `@${bUser.TelegramUsername}`;
            }

            if (bUser.TelegramID) updates.telegram_user_id = bUser.TelegramID;
            if (bUser.TelegramUsername) updates.telegram_username = bUser.TelegramUsername;
            if (bUser.authentication && bUser.authentication.email) updates.email = bUser.authentication.email.email;
            if (bUser.Date_LastOrder) updates.date_last_order = bUser.Date_LastOrder;
            if (bUser.TotalSumExchanges) updates.Total_Sum_Exchanges = bUser.TotalSumExchanges;

            const { error: updError } = await supabase
                .from('contacts')
                .update(updates)
                .eq('id', contact.id);

            if (updError) {
                console.error(`Failed to update ${contact.id}:`, updError.message);
                errorCount++;
            } else {
                console.log(`Updated ${contact.id}: ${contact.name} -> ${updates.name}`);
                updatedCount++;
            }

        } catch (err) {
            console.error(`Error processing contact ${contact.id}:`, err.message);
            errorCount++;
        }
    }

    console.log('Fix Complete.');
    console.log(`Updated: ${updatedCount}`);
    console.log(`Deleted (no orders): ${deletedCount}`);
    console.log(`Not Found in Chats/Bubble: ${notFoundCount}`);
    console.log(`Errors: ${errorCount}`);
}

fixUnknownViaChats();
