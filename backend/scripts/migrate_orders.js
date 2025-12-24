const fs = require('fs');
const path = require('path');
const { mapStatus } = require('../utils/statusMapping');
const envPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}
const { createClient } = require('@supabase/supabase-js');
// using native fetch

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

const API_URL = 'https://vega-ex.com/api/1.1/obj/order';
const API_TOKEN = 'b897577858b2a032515db52f77e15e38';

async function migrateOrders() {
    console.log('Starting migration...');

    // 1. Fetch Orders (Limit 100, assuming enough for last 2 days)
    // Or iterate if needed.
    const response = await fetch(`${API_URL}?limit=100&sort_field=Created%20Date&descending=true`, {
        headers: {
            'Authorization': `Bearer ${API_TOKEN}`
        }
    });

    const data = await response.json();
    const orders = data.response.results;

    console.log(`Fetched ${orders.length} orders from API.`);

    // 2. Filter last 2 days
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const recentOrders = orders.filter(o => new Date(o['Created Date']) > twoDaysAgo);
    console.log(`Found ${recentOrders.length} orders from last 2 days.`);

    for (const order of recentOrders) {
        try {
            const externalId = order.ID;

            // Duplication check
            const { data: existing } = await supabase
                .from('deals')
                .select('id')
                .eq('external_id', externalId)
                .maybeSingle();

            if (existing) {
                console.log(`Order ${externalId} already exists. Skipping.`);
                continue;
            }

            // Resolve Contact - STRICT TG ID MATCHING
            let contactId = null;
            let phone = order.MobilePhone;
            let telegramId = null;
            let tgAmo = order.tg_amo; // "undefined, ID: 5260274871" or "username, ID: 123"

            if (tgAmo && tgAmo.includes('ID:')) {
                const match = tgAmo.match(/ID:\s*(\d+)/);
                if (match) telegramId = match[1];
            }

            // Strict TG ID Resolution Debugging
            if (telegramId) {
                console.log(`Looking for contact with TG ID: ${telegramId} for order ${externalId}`);
                const { data: c } = await supabase.from('contacts').select('id, telegram_user_id').eq('telegram_user_id', telegramId).maybeSingle();
                if (c) {
                    console.log(`Found MATCHING contact: ${c.id} (TG: ${c.telegram_user_id})`);
                    contactId = c.id;
                } else {
                    console.log(`No contact found for TG ID: ${telegramId}`);
                }
            } else {
                console.log(`Order ${externalId} has no TG ID. Skipping strict lookup.`);
            }

            // Fallback phone check (REMOVED - STRICT MODE)
            // if (!contactId && phone) { ... } 

            // Create Contact if missing
            if (!contactId) {
                // If it was skipped because "123" phone, checking logic
                let validPhone = (phone && phone !== '123' && phone.length > 5) ? phone : null;

                const name = (tgAmo && !tgAmo.startsWith('undefined'))
                    ? tgAmo.split(',')[0]
                    : (order.User ? `User ${order.User.substring(0, 8)}` : `Order ${externalId}`);

                // Check if we are accidentally creating a dupe manually?
                // No, insert should handle it?

                console.log(`Creating NEW contact for ${externalId}: ${name}, TG: ${telegramId}, Phone: ${validPhone}`);

                const { data: newContact, error: ce } = await supabase.from('contacts').insert({
                    name: name,
                    phone: validPhone,
                    telegram_user_id: telegramId || null,
                    status: 'active'
                }).select().single();

                if (newContact) {
                    contactId = newContact.id;
                    console.log(`Created new contact: ${newContact.id}`);
                } else {
                    console.error(`Error creating contact for ${externalId}:`, ce);
                    // If error is unique constraint?
                    if (ce && ce.code === '23505') { // Unique violation
                        console.log('Unique constraint hit. Trying to find existing by phone fallback (dangerous)?');
                        // Maybe we hit unique phone?
                    }
                }
            }

            // Create Chat (Lead) if possible but 'chats' table uses chat_id (string) vs lead_id (uuid)
            // If we made a contact, we might want a chat.
            // But for bulk migration, maybe just inserting the deal is enough if we don't have chat history?
            // Let's create a "fake" chat record to ensure lead_id is valid if we want to trace it later.
            // The `deals` schema has `lead_id` as INTEGER? Wait, SQL query said integer.
            // But in previous context UUIDs were used for `lead_id` in `chats` and `messages`. 
            // Checking `deals` constraints: `lead_id` type is integer?
            // Step 508 output: `column_name: lead_id, data_type: integer`.
            // WAIT. If `lead_id` in `deals` is integer, but `chats.lead_id` is UUID (from previous tasks), there is a MISMATCH.
            // Or `deals.lead_id` refers to legacy leads table ID (int)?
            // In `backend/routes/bot.js` we were putting UUIDs into `deals.lead_id` (via insert).
            // Postgres `integer` strictly implies 32-bit int. UUID is string/uuid type.
            // Only `contacts.id` is int.
            // If `deals.lead_id` is actually integer, then my bot code `lead_id: newLeadId` (UUID) would have failed?
            // BUT the bot insert code worked.
            // Maybe `deals.lead_id` was changed to UUID/text before? Or SQL output is truncated/misinterpreted?
            // Ah, step 508 output `data_type: integer` for `lead_id`.
            // If the bot writes UUID to it, it MUST fail.
            // Unless `deals` has `uuid` type?
            // Step 508 says: `id: integer`, `lead_id: integer`.
            // Let's re-verify `deals` lead_id type specifically.

            // MAPPING
            const dealData = {
                external_id: externalId,
                title: `Заказ #${order.orderID || externalId} (${order.CurrPair1} -> ${order.CurrPair2})`,
                type: 'exchange',
                status: mapStatus(order.OrderStatus),
                created_at: order['Created Date'],
                description: order.Comment,
                contact_id: contactId,

                // New Fields
                city_1: order.CityRus01,
                city_2: order.CityEsp02 || order.City,
                currency_give: order.CurrPair1,
                currency_get: order.CurrPair2,
                amount_give: order.SumInput,
                amount_get: order.SumOutput,
                bank_1: order.BankRus01,
                bank_2: order.BankRus02, // If exists in source
                delivery_time: order.DeliveryTime,
                payment_timing: order['PayNow?'],
                is_paid: order['OrderPaid?'],
                client_phone: order.MobilePhone,
                telegram_amo_id: order.tg_amo,
                amount_partly_paid: order.SumPartly,
                order_date: order.date,
                external_creator_id: order['Created By'],
                external_user_id: order.User,
                label_color: order.color,
                location_url: order.Location2,
                location_url_alt: order.Location1,
                is_remote: order['Remote?'],
                delivery_day_type: order.NextDay,
                mongo_id: order._id,
                external_updated_at: order['Modified Date'],
                atm: order.ATM,
                attached_check: order.AttachedCheck,
                // ... mapped fields
            };

            const { error } = await supabase.from('deals').insert(dealData);

            if (error) {
                console.error(`Failed to insert order ${externalId}:`, error.message);
            } else {
                console.log(`Inserted order ${externalId}`);
            }

        } catch (err) {
            console.error('Error processing order:', err);
        }
    }

    console.log('Migration finished.');
}

// Status mapping handled by utils/statusMapping.js

migrateOrders();
