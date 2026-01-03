const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BUBBLE_ORDER_URL = 'https://vega-ex.com/api/1.1/obj/Order';
const BUBBLE_USER_URL = 'https://vega-ex.com/api/1.1/obj/User';
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function cleanupContacts() {
    console.log('Cleaning up "Unknown" and "Client ..." contacts...');

    // 1. Find Bad Contacts
    // Criteria: Starts with "User Unknown", "Client ", or equals "unknown"
    const { data: badContacts, error } = await supabase
        .from('contacts')
        .select('id, name')
        .or('name.ilike.User Unknown%,name.ilike.Client %,name.ilike.unknown');

    if (error) {
        console.error('Error fetching bad contacts:', error);
        return;
    }

    console.log(`Found ${badContacts.length} potentially bad contacts.`);

    let mergedCount = 0;
    let updatedCount = 0;
    let deletedEmptyCount = 0;
    let errors = 0;

    for (const contact of badContacts) {
        try {
            // 2. Find associated orders (to find the Bubble link)
            const { data: orders } = await supabase
                .from('orders')
                .select('id, main_id, OrderName')
                .eq('contact_id', contact.id);

            if (!orders || orders.length === 0) {
                // If no orders and bad name, maybe safe to delete? 
                // Or keep? Let's delete if it's strictly "User Unknown" or "Client Unknown".
                if (contact.name === 'User Unknown' || contact.name === 'Client Unknown') {
                    await supabase.from('contacts').delete().eq('id', contact.id);
                    // console.log(`Deleted empty bad contact: ${contact.id} (${contact.name})`);
                    deletedEmptyCount++;
                }
                continue;
            }

            // 3. Use the first order to find the Bubble User
            // main_id is now numeric (User's main_ID). We need to search Bubble Order by main_ID.
            const order = orders[0];
            if (!order.main_id) {
                console.warn(`Contact ${contact.id} (${contact.name}) has order ${order.id} without main_id. Skip.`);
                continue;
            }

            // Fetch Bubble Order
            const ordResponse = await axios.get(BUBBLE_ORDER_URL, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
                params: {
                    constraints: JSON.stringify([
                        { key: 'main_ID', constraint_type: 'equals', value: order.main_id }
                    ]),
                    limit: 1
                }
            });

            const bOrders = ordResponse.data.response.results;
            if (bOrders.length === 0) {
                console.warn(`Order ${order.main_id} not found in Bubble. Cannot resolve user for Contact ${contact.id}.`);
                continue;
            }

            const bOrder = bOrders[0];
            const bubbleUserId = bOrder.User; // This is the System ID (_id) of the User

            if (!bubbleUserId) {
                console.warn(`Bubble Order ${bOrder._id} has no User field.`);
                continue;
            }

            // 4. Find "Good" Contact by bubble_id
            const { data: goodContact } = await supabase
                .from('contacts')
                .select('id, name, bubble_id')
                .eq('bubble_id', bubbleUserId)
                .neq('id', contact.id) // Don't find self
                .maybeSingle();

            if (goodContact) {
                // MERGE: Move orders to good contact, delete bad contact
                const { error: moveError } = await supabase
                    .from('orders')
                    .update({ contact_id: goodContact.id })
                    .eq('contact_id', contact.id);

                if (moveError) throw moveError;

                await supabase.from('contacts').delete().eq('id', contact.id);
                // console.log(`Merged ${contact.name} (${contact.id}) -> ${goodContact.name} (${goodContact.id})`);
                mergedCount++;
            } else {
                // UPDATE: Fetch User details and rename this contact
                const userResp = await axios.get(`${BUBBLE_USER_URL}/${bubbleUserId}`, {
                    headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
                });
                const bUser = userResp.data.response;

                // Map fields
                const updates = {
                    name: bUser.AmoName || bUser.FirstName || 'Unknown User',
                    bubble_id: bubbleUserId, // Set the link!
                    first_name: bUser.FirstName,
                    last_name: bUser.LastName,
                    telegram_username: bUser.TelegramUsername,
                    date_last_order: bUser.Date_LastOrder,
                    Total_Sum_Exchanges: bUser.TotalSumExchanges
                };

                if (bUser.TelegramID) updates.telegram_user_id = bUser.TelegramID;
                if (bUser.authentication && bUser.authentication.email) updates.email = bUser.authentication.email.email;

                // Check if telegram_id conflict exists?
                // If we try to update this contact with a TG ID that another contact already has, it might duplicate logic?
                // If conflict, we should have merged. But we checked 'bubble_id'. Maybe check TG ID too?

                if (updates.telegram_user_id) {
                    const { data: conflictTg } = await supabase.from('contacts').select('id').eq('telegram_user_id', updates.telegram_user_id).neq('id', contact.id).maybeSingle();
                    if (conflictTg) {
                        // Merge into conflictTg
                        await supabase.from('orders').update({ contact_id: conflictTg.id }).eq('contact_id', contact.id);
                        await supabase.from('contacts').delete().eq('id', contact.id);
                        mergedCount++;
                        continue;
                    }
                }

                const { error: updError } = await supabase.from('contacts').update(updates).eq('id', contact.id);
                if (updError) throw updError;

                // console.log(`Updated ${contact.name} -> ${updates.name}`);
                updatedCount++;
            }

        } catch (err) {
            console.error(`Error processing contact ${contact.id}:`, err.message);
            errors++;
        }
    }

    console.log('Cleanup Complete.');
    console.log(`Merged: ${mergedCount}`);
    console.log(`Updated (Renamed): ${updatedCount}`);
    console.log(`Deleted Empty: ${deletedEmptyCount}`);
    console.log(`Errors: ${errors}`);
}

cleanupContacts();
