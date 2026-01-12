const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function testContactMessages() {
    const contactId = 5178;

    // Simulate API logic
    const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select(`
      id,
      telegram_user_id,
      orders(id, main_id, OrderName)
    `)
        .eq('id', contactId)
        .single();

    if (contactError) {
        console.error('Contact error:', contactError);
        return;
    }

    console.log('Contact:', contact.id);
    console.log('TG ID:', contact.telegram_user_id);
    console.log('Orders:', contact.orders?.length);

    const leadIds = new Set();

    if (contact?.telegram_user_id) {
        leadIds.add(String(contact.telegram_user_id));
    }

    contact?.orders?.forEach(o => {
        if (o.main_id) {
            leadIds.add(String(o.main_id));
        }
    });

    const leadIdsArray = Array.from(leadIds);
    console.log('Search leadIds:', leadIdsArray);

    const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .in('main_id', leadIdsArray)
        .order('"Created Date"', { ascending: true });

    if (messagesError) {
        console.error('Messages error:', messagesError);
        return;
    }

    console.log('\nFound messages:', messages?.length);
    messages?.forEach(m => {
        console.log(`- [${m.id}] ${m.author_type}: ${m.content?.substring(0, 50)}`);
    });
}

testContactMessages().catch(console.error);
