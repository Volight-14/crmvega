const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function listRecent() {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('Created Date', { ascending: false })
        .limit(10);

    if (error) { console.error(error); return; }

    console.log(JSON.stringify(data, null, 2));
}

listRecent();
