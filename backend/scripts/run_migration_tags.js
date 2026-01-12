require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Try to find the connection string
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
    console.error('No database connection string found in environment variables (DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL).');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const sqlPath = path.join(__dirname, '../migrations/20260112_tags.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        console.log('SQL content length:', sql.length);

        await pool.query(sql);
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

run();
