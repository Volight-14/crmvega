require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixOrders() {
    const mainId = '1768499030006'; // Order 1973
    const targetTgId = '715033350';
    const badContactId = 8833; // From previous inspection

    console.log(`Fixing Order ${mainId}...`);

    // 1. Get correct contact ID
    const { data: correctContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('telegram_user_id', targetTgId)
        .single();

    if (!correctContact) {
        console.error('Target contact not found!');
        return;
    }

    console.log(`Target Contact ID: ${correctContact.id}`);

    // 2. Link Order
    const { error: updateError } = await supabase
        .from('orders')
        .update({ contact_id: correctContact.id })
        .eq('main_id', mainId);

    if (updateError) {
        console.error('Update failed:', updateError);
        return;
    }
    console.log('Order re-linked successfully.');

    // 3. Delete Bad Contact
    const { error: delError } = await supabase
        .from('contacts')
        .delete()
        .eq('id', badContactId);

    if (delError) console.error('Delete bad contact failed:', delError);
    else console.log('Bad contact deleted.');
}

fixOrders();
