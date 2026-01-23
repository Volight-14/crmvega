
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function cleanupUnknowns() {
    console.log('Starting cleanup of "User Unknown" contacts...');

    // 1. Fetch all suspected contacts
    // Limit to 200 at a time to avoid heavy load/timeouts if run repeatedly
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, name')
        .ilike('name', '%Unknown%')
        .limit(200);

    if (error) {
        console.error('Error fetching contacts:', error);
        return;
    }

    console.log(`Checking batch of ${contacts.length} potential "Unknown" contacts...`);

    let deletedCount = 0;
    let linkedCount = 0;
    let linkedExamples = [];

    // Batch process in chunks of 20
    const CHUNK_SIZE = 20;
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
        const batch = contacts.slice(i, i + CHUNK_SIZE);

        await Promise.all(batch.map(async (contact) => {
            // Check strict conditions to avoid deleting useful "Unknowns" if any
            if (!contact.name.includes('Unknown') && !contact.name.includes('User null')) return;

            // Check orders
            const { count: orderCount } = await supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .eq('contact_id', contact.id);

            if (orderCount > 0) {
                linkedCount++;
                if (linkedExamples.length < 5) {
                    const { data: order } = await supabase
                        .from('orders')
                        .select('id, title, status, created_at, main_id, OrderName')
                        .eq('contact_id', contact.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();

                    if (order) {
                        linkedExamples.push({
                            contact: { id: contact.id, name: contact.name },
                            order: order
                        });
                    }
                }
            } else {
                // No orders -> Delete
                const { error: deleteError } = await supabase
                    .from('contacts')
                    .delete()
                    .eq('id', contact.id);

                if (!deleteError) {
                    deletedCount++;
                }
            }
        }));

        // Small delay to be nice to DB (optional)
        // process.stdout.write('.'); 
    }

    console.log('\n------------------------------------------------');
    console.log(`Batch Complete.`);
    console.log(`Deleted Contacts (0 orders): ${deletedCount}`);
    console.log(`Skipped Contacts (>0 orders): ${linkedCount}`);

    if (linkedExamples.length > 0) {
        console.log('\n--- Examples of Unknown Contacts WITH Orders ---');
        linkedExamples.forEach((ex, i) => {
            console.log(`${i + 1}. Contact: "${ex.contact.name}" (ID: ${ex.contact.id})`);
            console.log(`   Linked Order: ${ex.order?.OrderName || ex.order?.title} (Status: ${ex.order?.status})`);
            console.log(`   Link: https://crmvega.vercel.app/order/${ex.order?.main_id || ex.order?.id}`);
            console.log('');
        });
    }
}

cleanupUnknowns();
