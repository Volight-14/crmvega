require('dotenv').config({ path: '../../.env' });
console.log('Root URL:', process.env.SUPABASE_URL);
require('dotenv').config({ path: '../.env' });
console.log('Backend URL:', process.env.SUPABASE_URL);
