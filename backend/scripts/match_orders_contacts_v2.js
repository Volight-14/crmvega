require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function matchOrdersToContacts() {
    console.log('Starting matching process...');

    // 1. Fetch all contacts with a valid telegram_user_id
    console.log('Fetching contacts...');
    const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, telegram_user_id, name')
        .not('telegram_user_id', 'is', null);

    if (contactsError) {
        console.error('Error fetching contacts:', contactsError);
        return;
    }

    const contactMap = {}; // telegram_user_id -> contact_id
    contacts.forEach(c => {
        // Normalize to string just in case
        if (c.telegram_user_id) {
            contactMap[String(c.telegram_user_id).trim()] = c.id;
        }
    });

    console.log(`Loaded ${contacts.length} contacts with Telegram IDs.`);

    // 2. Fetch orders that have BubbleUser set
    // We process in pages to handle large datasets if needed, but for now let's try getting all 
    // relevant ones or a large batch.
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true });
    console.log(`Total orders in DB: ${count}`);

    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, "OrderName", "BubbleUser", contact_id')
        .not('"BubbleUser"', 'is', null);

    if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        return;
    }

    console.log(`Found ${orders.length} orders with 'BubbleUser' field populated.`);

    let updatedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;

    for (const order of orders) {
        const bubbleUser = String(order.BubbleUser).trim();

        // Check if BubbleUser looks like a Telegram ID (digits)
        // Sometimes it might be mixed, but usually digits.
        // If it's not in map, we can't do much.

        if (contactMap[bubbleUser]) {
            const correctContactId = contactMap[bubbleUser];

            if (order.contact_id !== correctContactId) {
                // Needs update
                console.log(`[MATCH] Order ${order.id} (BubbleUser: ${bubbleUser}) -> Contact ${correctContactId}`);

                const { error: updateError } = await supabase
                    .from('orders')
                    .update({ contact_id: correctContactId })
                    .eq('id', order.id);

                if (updateError) {
                    console.error(`Failed to update order ${order.id}:`, updateError);
                } else {
                    updatedCount++;
                }
            } else {
                skippedCount++;
            }
        } else {
            notFoundCount++;
            // Optional: Log specifics if needed
            // console.log(`[NO MATCH] Order ${order.id} has BubbleUser ${bubbleUser} but no contact found.`);
        }
    }

    console.log('------------------------------------------------');
    console.log(`Process Complete.`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Already Correct: ${skippedCount}`);
    console.log(`No Contact Found (for BubbleUser ID): ${notFoundCount}`);
}

matchOrdersToContacts();
