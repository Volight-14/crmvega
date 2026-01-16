require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function inspectBadContact() {
    const badId = 8834;

    const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', badId)
        .single();

    console.log('Bad Contact:', contact);
}

inspectBadContact();
