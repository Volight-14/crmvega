require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function deepCheck() {
    const target = '715033350';
    console.log(`Deep checking TG ID: ${target}`);

    // 1. Check all contacts with this ID (as string or number)
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, name, telegram_user_id')
        .or(`telegram_user_id.eq.${target},telegram_user_id.eq.${parseInt(target)}`);

    if (error) {
        console.error('Error fetching contacts:', error);
        return;
    }

    console.log(`Found ${contacts.length} contacts matching ${target}:`);
    contacts.forEach(c => console.log(c));

    // 2. Simulate the EXACT Query logic used in the route
    console.log('\nSimulating route query...');
    const { data: routeResult, error: routeError } = await supabase
        .from('contacts')
        .select('id')
        .eq('telegram_user_id', String(target))
        .maybeSingle();

    if (routeError) console.error('Route Query Error:', routeError);
    console.log('Route Query Result:', routeResult);

    // 3. Check what happens if we pass number
    console.log('\nSimulating number query...');
    const { data: numResult } = await supabase
        .from('contacts')
        .select('id')
        .eq('telegram_user_id', parseInt(target))
        .maybeSingle();
    console.log('Number Query Result:', numResult);
}

deepCheck();
