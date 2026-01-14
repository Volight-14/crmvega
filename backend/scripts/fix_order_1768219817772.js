const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Data from Debug
const TARGET_MAIN_ID = '1768219817772'; // Order Main ID
const TG_ID = '8455878792';
const BUBBLE_USER_ID = '1755415687041x763213319808587100';
const NAME = 'Кирилл 09051808'; // AmoName
const ALT_NAME = 'Доска - Брус'; // FirstName

async function fix() {
    console.log('🛠 Fixing Order', TARGET_MAIN_ID);

    // 1. Find the Order
    const { data: order } = await supabase.from('orders').select('id, contact_id').eq('main_id', TARGET_MAIN_ID).single();
    if (!order) { console.log('Order not found'); return; }
    console.log('Found Order:', order);

    // 2. Check if correct contact already exists
    const { data: existingContact } = await supabase
        .from('contacts')
        .select('*')
        .eq('telegram_user_id', TG_ID)
        .maybeSingle();

    if (existingContact) {
        console.log('✅ Found existing contact for this user:', existingContact.name, existingContact.id);

        // Update Order to use existing contact
        await supabase.from('orders').update({ contact_id: existingContact.id }).eq('id', order.id);
        console.log(`✅ Linked Order ${order.id} to Contact ${existingContact.id}`);

        // Delete the dummy contact if it has no other orders
        if (order.contact_id && order.contact_id !== existingContact.id) {
            // Check if dummy contact has other orders
            const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('contact_id', order.contact_id);
            if (count <= 1) { // Only this order (which we just moved, count might be 0 now) or 0
                // Actually we just moved it. So count should be 0.
                await supabase.from('contacts').delete().eq('id', order.contact_id);
                console.log(`🗑 Deleted dummy contact ${order.contact_id}`);
            } else {
                console.log(`⚠️ Dummy contact ${order.contact_id} has other orders, keeping it.`);
            }
        }
    } else {
        console.log('ℹ️ Contact not found by TG ID. Updating the dummy contact...');

        // Update the current contact (linked to order)
        const updateData = {
            name: NAME || ALT_NAME,
            telegram_user_id: TG_ID,
            bubble_id: BUBBLE_USER_ID,
            status: 'active'
        };

        const { error } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', order.contact_id);

        if (error) console.error('Error updating contact:', error);
        else console.log(`✅ Updated Contact ${order.contact_id} with correct details.`);
    }
}

fix();
