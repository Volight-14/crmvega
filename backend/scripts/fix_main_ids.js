const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BUBBLE_API_URL = 'https://vega-ex.com/api/1.1/obj/Order';
const BUBBLE_TOKEN = 'b897577858b2a032515db52f77e15e38';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixMainIds() {
    console.log('Fixing main_id: Replacing System IDs (with "x") with numeric main_ID...');

    // 1. Get orders with "x" in main_id (Bubble System IDs)
    // We can't do LIKE in supabase JS easily on numeric column if it was numeric? 
    // currently it is TEXT.
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, main_id')
        .ilike('main_id', '%x%'); // Assume Bubble IDs have 'x'

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Found ${orders.length} orders with system IDs.`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const order of orders) {
        const systemId = order.main_id; // e.g. "1721...x..."

        try {
            // Fetch from Bubble using System ID
            const response = await axios.get(`${BUBBLE_API_URL}/${systemId}`, {
                headers: { Authorization: `Bearer ${BUBBLE_TOKEN}` }
            });

            const bOrder = response.data.response;
            const numericMainId = bOrder.main_ID; // The numeric field

            if (!numericMainId) {
                console.warn(`[Order ${order.id}] No numeric main_ID found in Bubble for ${systemId}. Skipping.`);
                errorCount++;
                continue;
            }

            // Update Supabase
            const { error: updateError } = await supabase
                .from('orders')
                .update({ main_id: String(numericMainId) }) // Store as string for now to be safe with TEXT column
                .eq('id', order.id);

            if (updateError) {
                console.error(`[Order ${order.id}] Update failed:`, updateError.message);
                errorCount++;
            } else {
                // console.log(`[Order ${order.id}] Fixed: ${systemId} -> ${numericMainId}`);
                updatedCount++;
            }

        } catch (err) {
            if (err.response && err.response.status === 404) {
                console.error(`[Order ${order.id}] Bubble Order ${systemId} not found.`);
            } else {
                console.error(`[Order ${order.id}] Error:`, err.message);
            }
            errorCount++;
        }
    }

    console.log('Fix Complete.');
    console.log(`Updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);
}

fixMainIds();
