
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY is required for safe cleanup.');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function safeCleanup() {
    console.log('Starting SAFE cleanup of "User Unknown" contacts...');
    console.log('(Deleting ONLY contacts with 0 orders, using Admin Privileges)');

    // 1. Fetch potential contacts
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, name')
        .ilike('name', '%Unknown%')
        .limit(500); // Process in chunks

    if (error) {
        console.error('Error fetching contacts:', error);
        return;
    }

    console.log(`Found ${contacts.length} potential "Unknown" contacts to check.`);

    let deletedCount = 0;
    let keptCount = 0;
    let keptExamples = [];

    for (const contact of contacts) {
        // Safety check: Explicitly count orders using ADMIN client
        const { count: orderCount, error: countErr } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('contact_id', contact.id);

        if (countErr) {
            console.error(`Error checking orders for contact ${contact.id}:`, countErr);
            continue;
        }

        if (orderCount > 0) {
            keptCount++;
            if (keptExamples.length < 5) {
                // Fetch order details for report
                const { data: order } = await supabase.from('orders').select('id, status, main_id, OrderName').eq('contact_id', contact.id).limit(1).maybeSingle();
                keptExamples.push({ contact, order, count: orderCount });
            }
        } else {
            // 0 Orders -> Safe to Delete
            const { error: delErr } = await supabase
                .from('contacts')
                .delete()
                .eq('id', contact.id);

            if (!delErr) {
                deletedCount++;
                // console.log(`Deleted empty contact ${contact.id}`);
            } else {
                console.error(`Failed to delete ${contact.id}:`, delErr);
            }
        }

        // Tiny throttle to avoid rate limits
        // await new Promise(r => setTimeout(r, 10));
    }

    console.log('------------------------------------------------');
    console.log(`Batch Complete.`);
    console.log(`✅ Deleted Contacts (Verified 0 orders): ${deletedCount}`);
    console.log(`🔒 Kept Contacts (Have orders): ${keptCount}`);

    if (keptExamples.length > 0) {
        console.log('\n--- Examples of Kept Contacts (Have Orders) ---');
        keptExamples.forEach(ex => {
            console.log(`Contact: ${ex.contact.name} (ID: ${ex.contact.id})`);
            console.log(`   Orders: ${ex.count} | Last: ${ex.order?.OrderName || 'No Title'} (Status: ${ex.order?.status})`);
        });
    }
}

safeCleanup();
