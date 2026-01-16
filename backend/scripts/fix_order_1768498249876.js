require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fix() {
    const mainId = '1768498249876';
    const correctContactId = 6494; // Анатолий
    const badContactId = 8832; // User Unknown

    console.log(`Fixing Order ${mainId}...`);

    // 1. Update Order
    const { error: updateError } = await supabase
        .from('orders')
        .update({ contact_id: correctContactId })
        .eq('main_id', mainId);

    if (updateError) {
        console.error('Error updating order:', updateError);
        return;
    }
    console.log(`Order linked to contact ${correctContactId}`);

    // 2. Check if bad contact has other orders
    const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', badContactId);

    if (count === 0) {
        console.log(`Contact ${badContactId} (User Unknown) has no other orders. Deleting...`);
        const { error: deleteError } = await supabase
            .from('contacts')
            .delete()
            .eq('id', badContactId);

        if (deleteError) console.error('Error deleting bad contact:', deleteError);
        else console.log('Bad contact deleted.');
    } else {
        console.log(`Contact ${badContactId} has ${count} other orders. Keeping it.`);
    }
}

fix();
