const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
// Try absolute path if relative fails
// Also try standard location
if (!process.env.SUPABASE_URL) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

// Hardcode from typical setup if still missing - NO, I can't guess.

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

console.log('URL found:', !!supabaseUrl);

if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    supabase.from('messages').select('*').limit(1).then(({ data, error }) => {
        if (error) console.error(error);
        else console.log('Keys:', Object.keys(data[0] || {}));
    });
}
