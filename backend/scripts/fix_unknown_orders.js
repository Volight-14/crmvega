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

async function fixUnknownOrders() {
    console.log('Fixing orders with "User Unknown" contacts...\n');

    // 1. Get all orders with Unknown contacts
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, main_id, contact_id, contacts!inner(name)')
        .in('contacts.name', ['User Unknown', 'Client Unknown']);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Found ${orders.length} orders with Unknown contacts.\n`);

    let fixed = 0;
    let deleted = 0;
    let notFound = 0;
    let errors = 0;

    for (const order of orders) {
        try {
            console.log(`Processing order ${order.main_id}...`);

            // 2. Get Order from Bubble
            const orderResp = await axios.get(BUBBLE_ORDER_URL, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
                params: {
                    constraints: JSON.stringify([
                        { key: 'main_ID', constraint_type: 'equals', value: order.main_id }
                    ]),
                    limit: 1
                },
                timeout: 10000
            });

            const bubbleOrder = orderResp.data.response.results[0];
            if (!bubbleOrder) {
                console.log(`  Order not found in Bubble. Skipping.`);
                notFound++;
                continue;
            }

            const bubbleUserId = bubbleOrder.User;
            if (!bubbleUserId) {
                console.log(`  Order has no User field in Bubble. Keeping as Unknown.`);
                notFound++;
                continue;
            }

            // Step 2a: Check if we already have this Bubble User linked locally
            const { data: cachedContact } = await supabase
                .from('contacts')
                .select('id')
                .eq('bubble_id', bubbleUserId)
                .maybeSingle();

            let contactId;

            if (cachedContact) {
                contactId = cachedContact.id;
                console.log(`  Found existing contact ${contactId} by Bubble ID ${bubbleUserId}`);
            } else {
                // 3. Get User from Bubble
                let bubbleUser;
                try {
                    const userResp = await axios.get(`${BUBBLE_USER_URL}/${bubbleUserId}`, {
                        headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
                        timeout: 5000
                    });
                    bubbleUser = userResp.data.response;
                } catch (err) {
                    console.log(`  User ${bubbleUserId} not found in Bubble.`);
                    notFound++;
                    continue;
                }

                const telegramId = bubbleUser.TelegramID;

                // 4. Find or create contact
                if (telegramId) {
                    const { data: existingContact } = await supabase
                        .from('contacts')
                        .select('id, bubble_id')
                        .eq('telegram_user_id', telegramId)
                        .maybeSingle();

                    if (existingContact) {
                        contactId = existingContact.id;
                        console.log(`  Found existing contact ${contactId} (TG: ${telegramId})`);

                        // Link bubble_id if missing
                        if (!existingContact.bubble_id) {
                            await supabase
                                .from('contacts')
                                .update({ bubble_id: bubbleUserId })
                                .eq('id', contactId);
                            console.log(`  -> Linked Bubble ID ${bubbleUserId} to contact ${contactId}`);
                        }
                    }
                }

                if (!contactId) {
                    // Try phone match
                    let phone = bubbleOrder.MobilePhone || bubbleUser.Phone || bubbleUser.MobilePhone;
                    if (phone) phone = String(phone).replace(/[^\d+]/g, '');

                    if (phone) {
                        const { data: phoneContact } = await supabase
                            .from('contacts')
                            .select('id, bubble_id')
                            .eq('phone', phone)
                            .maybeSingle();

                        if (phoneContact) {
                            contactId = phoneContact.id;
                            // Link bubble_id
                            if (!phoneContact.bubble_id) {
                                await supabase.from('contacts').update({ bubble_id: bubbleUserId }).eq('id', contactId);
                            }
                        }
                    }
                }

                if (!contactId && telegramId) {
                    // Create new contact with full data ONLY if we have Telegram ID (otherwise we can't really identify them well)
                    // Or should we create them even without TG ID if we have a name? 
                    // Let's stick to TG ID required for new creation to avoid junk, but maybe use phone?

                    const name = bubbleUser.AmoName ||
                        (bubbleUser.FirstName ? `${bubbleUser.FirstName} ${bubbleUser.LastName || ''}`.trim() : null) ||
                        (bubbleUser.TelegramUsername ? `@${bubbleUser.TelegramUsername}` : null) ||
                        `Client ${telegramId}`;

                    const { data: newContact, error: createError } = await supabase
                        .from('contacts')
                        .insert({
                            name: name,
                            telegram_user_id: telegramId,
                            telegram_username: bubbleUser.TelegramUsername || null,
                            bubble_id: bubbleUserId,
                            email: bubbleUser.authentication?.email?.email || null,
                            status: 'active'
                        })
                        .select('id')
                        .single();

                    if (createError) {
                        console.error(`  Error creating contact:`, createError.message);
                        errors++;
                        continue;
                    }

                    contactId = newContact.id;
                    console.log(`  Created new contact ${contactId} (${name})`);
                }
            }

            if (!contactId) {
                console.log(`  Could not identify user. Keeping as Unknown.`);
                notFound++;
                continue;
            }

            // 5. Update order
            const { error: updateError } = await supabase
                .from('orders')
                .update({ contact_id: contactId })
                .eq('id', order.id);

            if (updateError) {
                console.error(`  Error updating order:`, updateError.message);
                errors++;
                continue;
            }

            console.log(`  ✓ Updated order ${order.id} -> contact ${contactId}`);
            fixed++;

        } catch (err) {
            console.error(`  Error processing order ${order.id}:`, err.message);
            errors++;
        }
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Fixed: ${fixed}`);
    console.log(`Not found/No user: ${notFound}`);
    console.log(`Errors: ${errors}`);

    // 6. Clean up empty Unknown contacts
    console.log('\nCleaning up empty Unknown contacts...');
    const { error: deleteError } = await supabase
        .from('contacts')
        .delete()
        .in('name', ['User Unknown', 'Client Unknown'])
        .not('id', 'in', `(SELECT DISTINCT contact_id FROM orders WHERE contact_id IS NOT NULL)`);

    if (!deleteError) {
        console.log('✓ Deleted empty Unknown contacts');
    }
}

fixUnknownOrders().catch(console.error);
