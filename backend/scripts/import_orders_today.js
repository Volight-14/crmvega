const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration
const BUBBLE_API_URL = 'https://vega-ex.com/api/1.1/obj/Order';
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38';
// Start of today (assuming user's timezone overlap, or UTC 00:00 covering 30th)
const START_DATE = '2025-12-30T00:00:00.000Z';

const STATUS_MAP = {
    'Создан': 'unsorted',
    'Новая': 'unsorted',
    'В работе': 'in_progress',
    'Оплачен': 'in_progress',
    'Выполнен': 'completed',
    'Завершен': 'completed',
    'Отменен': 'client_rejected',
    'Отказ': 'client_rejected',
    'Мошенник': 'scammer',
    'Дубль': 'duplicate',
};

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function findOrCreateContact(bubbleOrder) {
    const BUBBLE_USER_URL = 'https://vega-ex.com/api/1.1/obj/User';

    // Step 1: Get User ID from Order
    const bubbleUserId = bubbleOrder.User;

    if (bubbleUserId) {
        try {
            // Step 2: Fetch User from Bubble by ID
            const userResponse = await axios.get(`${BUBBLE_USER_URL}/${bubbleUserId}`, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
            });

            const bubbleUser = userResponse.data.response;
            const telegramId = bubbleUser.TelegramID;

            // Step 3: Search contact by telegram_user_id
            if (telegramId) {
                const { data: existing } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('telegram_user_id', telegramId)
                    .maybeSingle();

                if (existing) {
                    console.log(`Found contact ${existing.id} by TG ID ${telegramId}`);
                    return existing.id;
                }

                // Step 4: If not found, create new contact with full data
                const name = bubbleUser.AmoName ||
                    (bubbleUser.FirstName ? `${bubbleUser.FirstName} ${bubbleUser.LastName || ''}`.trim() : null) ||
                    bubbleUser.TelegramUsername ? `@${bubbleUser.TelegramUsername}` :
                    `Client ${telegramId}`;

                const { data: newContact, error } = await supabase
                    .from('contacts')
                    .insert({
                        name: name,
                        telegram_user_id: telegramId,
                        telegram_username: bubbleUser.TelegramUsername || null,
                        bubble_id: bubbleUserId,
                        email: bubbleUser.authentication?.email?.email || null,
                        status: 'active',
                        created_at: bubbleOrder['Created Date'] || new Date().toISOString()
                    })
                    .select('id')
                    .single();

                if (error) throw error;
                console.log(`Created new contact ${newContact.id} for TG ID ${telegramId}`);
                return newContact.id;
            }
        } catch (err) {
            console.warn(`Could not fetch User ${bubbleUserId} from Bubble:`, err.message);
            // Fall through to fallback logic
        }
    }

    // Fallback: Try to match by phone if User lookup failed
    let phone = bubbleOrder.MobilePhone;
    if (phone) phone = String(phone).replace(/[^\d+]/g, '');

    if (phone) {
        const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('phone', phone)
            .maybeSingle();

        if (existing) return existing.id;
    }

    // Last resort: Create "Unknown" contact
    const name = bubbleOrder.ClientName || `User Unknown`;

    const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
            name: name,
            phone: phone || null,
            status: 'active',
            created_at: bubbleOrder['Created Date'] || new Date().toISOString()
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating contact:', error);
        return null;
    }

    return newContact.id;
}

async function importOrders() {
    console.log(`Importing orders created after ${START_DATE}...`);

    try {
        const response = await axios.get(BUBBLE_API_URL, {
            headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` },
            params: {
                sort_field: 'Created Date',
                descending: 'true',
                limit: 100
            }
        });

        const bubbleOrders = response.data.response.results;
        console.log(`Fetched ${bubbleOrders.length} recent orders from Bubble.`);

        let createdCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const bOrder of bubbleOrders) {
            // Check Date
            const orderDate = new Date(bOrder['Created Date']);
            const startDate = new Date(START_DATE);

            if (orderDate < startDate) {
                // Since sorted descending, we can stop or skip. 
                // To be safe against minor sort issues, we skip.
                // If we want to optimize, we can break if we are sure about sort.
                continue;
            }

            const bubbleId = bOrder._id;

            // Check if exists
            const { data: existing } = await supabase
                .from('orders')
                .select('id')
                .eq('main_id', bubbleId)
                .maybeSingle();

            if (existing) {
                // console.log(`Order ${bubbleId} already exists (ID: ${existing.id}). Skipping.`);
                skippedCount++;
                continue;
            }

            // Create
            const contactId = await findOrCreateContact(bOrder);

            const insertData = {
                main_id: bOrder.main_ID, // Use numeric main_ID as requested
                contact_id: contactId,
                status: STATUS_MAP[bOrder.OrderStatus] || 'unsorted',
                SumInput: bOrder.SumInput,
                SumOutput: bOrder.SumOutput,
                CurrPair1: bOrder.CurrPair1,
                CurrPair2: bOrder.CurrPair2,
                CityEsp02: bOrder.CityEsp02,
                DeliveryTime: bOrder.DeliveryTime,
                NextDay: bOrder.NextDay,
                Comment: bOrder.Comment,
                OrderName: bOrder.OrderName || (bOrder.Comment ? bOrder.Comment.slice(0, 50) : `Order ${bOrder.main_ID || ''}`),
                created_at: bOrder['Created Date'],
                // Default fields
                source: 'bubble_import'
            };

            const { data: newOrder, error: insertError } = await supabase
                .from('orders')
                .insert(insertData)
                .select('id')
                .single();

            if (insertError) {
                console.error(`Failed to insert order ${bubbleId}:`, insertError.message);
                errorCount++;
            } else {
                // console.log(`Created order ${newOrder.id} from Bubble ${bubbleId}`);
                createdCount++;
            }
        }

        console.log('Import Complete.');
        console.log(`Created: ${createdCount}`);
        console.log(`Skipped (Already Linked): ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);

    } catch (err) {
        console.error('Import failed:', err.message);
    }
}

importOrders();
