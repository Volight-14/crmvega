require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function inspectRaw() {
    const mainId = '1768498249876';

    const { data: order } = await supabase
        .from('orders')
        .select('BubbleUser')
        .eq('main_id', mainId)
        .single();

    if (order) {
        const val = order.BubbleUser;
        console.log(`Value: '${val}'`);
        console.log(`Length: ${val.length}`);
        for (let i = 0; i < val.length; i++) {
            console.log(`Char ${i}: ${val.charCodeAt(i)} (${val[i]})`);
        }
    }
}

inspectRaw();
