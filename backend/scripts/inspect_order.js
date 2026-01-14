const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function inspect(id) {
    console.log(`🔍 Inspecting Order with MainID: ${id}`);

    const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('main_id', id)
        .order('Created Date', { ascending: true });

    if (error) {
        console.error('Error fetching messages:', error);
        return;
    }

    console.log(`💬 Found ${messages?.length || 0} messages:`);
    if (messages && messages.length > 0) {
        messages.forEach(m => {
            // Log interesting fields
            console.log(`   - [${m.author_type}] ID:${m.id} Author:${m.author_name} (${m.author_id || 'no_id'}) Content: ${m.content?.substring(0, 30)}...`);
            console.log(`     Full Msg:`, JSON.stringify(m));
        });
    } else {
        console.log('   No messages found for this order.');
    }
}

inspect('1768219817772');
