const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration
const BUBBLE_API_URL = 'https://vega-ex.com/api/1.1/obj/Order';
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38';
const LIMIT_CONCURRENCY = 5;

// Status Mapping (Bubble -> CRM)
// Update this based on actual Bubble values found
const STATUS_MAP = {
    // Bubble Value : CRM Value
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
    // Add reasonable defaults for unknown statuses?
};

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    // Use Service Key if available to bypass RLS, otherwise Anon Key (might need Auth)
);

async function fetchBubbleOrderByID(id) {
    try {
        // Strategy 1: Direct fetch by _id (if id is the Bubble string ID)
        // Bubble IDs are typically 32 chars or timestamp+random.
        const url = `${BUBBLE_API_URL}/${id}`;
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
        });
        return response.data.response;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null;
        }
        // If invalid format, Bubble might return 400 or 404.
        // We ignore generic errors for Strategy 1 and try Strategy 2.
        return null;
    }
}

async function fetchBubbleOrderByMainID(numericId) {
    try {
        // Strategy 2: Search by main_ID (numeric field)
        const constraints = JSON.stringify([
            { key: 'main_ID', constraint_type: 'equals', value: String(numericId) }
        ]);
        const url = `${BUBBLE_API_URL}?constraints=${encodeURIComponent(constraints)}`;
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
        });
        const results = response.data.response.results;
        if (results && results.length > 0) {
            return results[0];
        }
        return null;
    } catch (error) {
        console.error(`Error searching by main_ID ${numericId}:`, error.message);
        return null;
    }
}

async function syncOrders() {
    console.log('Starting sync...');

    // 1. Get all orders from Supabase that have a main_id
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, main_id, OrderName, status')
        .not('main_id', 'is', null);

    if (error) {
        console.error('Error fetching orders from DB:', error);
        process.exit(1);
    }

    console.log(`Found ${orders.length} orders in DB with main_id.`);

    // 2. Process in chunks
    let updatedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    // Process sequentially or with limited concurrency
    for (let i = 0; i < orders.length; i += LIMIT_CONCURRENCY) {
        const chunk = orders.slice(i, i + LIMIT_CONCURRENCY);
        await Promise.all(chunk.map(async (order) => {
            const { id, main_id } = order;
            let bubbleOrder = null;

            try {
                // Try Strategy 1: main_id is Bubble _id
                bubbleOrder = await fetchBubbleOrderByID(main_id);

                // Try Strategy 2: main_id is numeric main_ID
                if (!bubbleOrder && /^\d+$/.test(main_id)) {
                    // If main_id looks numeric, try searching as main_ID
                    bubbleOrder = await fetchBubbleOrderByMainID(main_id);
                }

                if (!bubbleOrder) {
                    // console.log(`[Order ${id}] main_id ${main_id} not found in Bubble.`);
                    notFoundCount++;
                    return;
                }

                // Found! Update logic
                const updateData = {};

                // Map Status
                if (bubbleOrder.OrderStatus) {
                    const mappedStatus = STATUS_MAP[bubbleOrder.OrderStatus];
                    if (mappedStatus) {
                        updateData.status = mappedStatus;
                    } else {
                        // Keep existing or log unknown?
                        // console.log(`[Order ${id}] Unknown status: ${bubbleOrder.OrderStatus}`);
                    }
                }

                // Map Fields
                if (bubbleOrder.SumInput !== undefined) updateData.SumInput = bubbleOrder.SumInput;
                if (bubbleOrder.SumOutput !== undefined) updateData.SumOutput = bubbleOrder.SumOutput;
                if (bubbleOrder.DeliveryTime) updateData.DeliveryTime = bubbleOrder.DeliveryTime;
                if (bubbleOrder.NextDay) updateData.NextDay = bubbleOrder.NextDay;
                if (bubbleOrder.CityEsp02) updateData.CityEsp02 = bubbleOrder.CityEsp02;
                if (bubbleOrder.CurrPair1) updateData.CurrPair1 = bubbleOrder.CurrPair1;
                if (bubbleOrder.CurrPair2) updateData.CurrPair2 = bubbleOrder.CurrPair2;

                // Map Name
                if (bubbleOrder.OrderName) {
                    updateData.OrderName = bubbleOrder.OrderName;
                } else if (bubbleOrder.Comment && !order.OrderName) {
                    // Fallback: If no name in Bubble, and DB name is empty, maybe use Comment?
                    // But user said "update name". If Bubble has no name, we shouldn't overwrite existing valid name with null.
                    // If DB has "Order from Bubble", we might want to update it.
                    // updateData.OrderName = bubbleOrder.Comment; 
                    // -- Commenting out unsafe fallback unless requested --
                }

                // Map Comment
                if (bubbleOrder.Comment) {
                    updateData.Comment = bubbleOrder.Comment;
                }

                // Perform Update
                if (Object.keys(updateData).length > 0) {
                    const { error: updateError } = await supabase
                        .from('orders')
                        .update(updateData)
                        .eq('id', id);

                    if (updateError) {
                        console.error(`[Order ${id}] Update failed:`, updateError.message);
                        errorCount++;
                    } else {
                        // console.log(`[Order ${id}] Updated from Bubble ID ${bubbleOrder._id}`);
                        updatedCount++;
                    }
                } else {
                    // No changes needed
                }

            } catch (err) {
                console.error(`[Order ${id}] Error processing:`, err.message);
                errorCount++;
            }
        }));

        // Progress Indicator
        process.stdout.write(`\rProcessed ${Math.min(i + LIMIT_CONCURRENCY, orders.length)}/${orders.length}...`);
    }

    console.log('\nSync Complete.');
    console.log(`Updated: ${updatedCount}`);
    console.log(`Not Found: ${notFoundCount}`);
    console.log(`Errors: ${errorCount}`);
}

syncOrders();
