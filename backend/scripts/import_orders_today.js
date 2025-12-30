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
    // Try to match by phone
    let phone = bubbleOrder.MobilePhone;
    // Basic cleanup of phone
    if (phone) phone = String(phone).replace(/[^\d+]/g, '');

    if (phone) {
        const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('phone', phone)
            .maybeSingle();

        if (existing) return existing.id;
    }

    // If email?
    // bubbleOrder.User might have email if we fetch User object, but we only have Order.
    // Assuming MobilePhone is the main link.

    // Create new contact
    const name = bubbleOrder.ClientName || `Client ${phone || bubbleOrder.User || 'Unknown'}`;

    const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
            name: name,
            phone: phone || null,
            status: 'active', // Default
            created_at: bubbleOrder['Created Date'] || new Date().toISOString()
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating contact:', error.message);
        return null; // Should handle this
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
