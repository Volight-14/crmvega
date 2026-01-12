const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function check() {
    console.log('🔍 Checking database tables...');

    try {
        // Check tags table
        const { error: tagsError } = await supabase.from('tags').select('id').limit(1);
        if (tagsError) throw new Error(`Table 'tags' check failed: ${tagsError.message}`);
        console.log('✅ Table "tags" exists.');

        // Check order_tags table
        const { error: linksError } = await supabase.from('order_tags').select('order_id').limit(1);
        if (linksError) throw new Error(`Table 'order_tags' check failed: ${linksError.message}`);
        console.log('✅ Table "order_tags" exists.');

        // Check settings table
        const { data: settings, error: settingsError } = await supabase.from('app_settings').select('*').limit(1);
        if (settingsError) throw new Error(`Table 'app_settings' check failed: ${settingsError.message}`);
        console.log('✅ Table "app_settings" exists.');

        if (settings && settings.length > 0) {
            console.log('   Found settings:', settings);
        } else {
            console.log('⚠️  Table "app_settings" is empty (Default settings might be missing).');
        }

        console.log('\n🎉 Verification Successful! The tagging system is ready.');

    } catch (error) {
        console.error('\n❌ Verification Failed:', error.message);
        if (error.message.includes('create the table')) {
            console.log('   Hint: It seems the table was not created. Please run the SQL in Supabase Dashboard.');
        }
        process.exit(1);
    }
}

check();
