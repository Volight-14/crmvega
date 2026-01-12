#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function applyMigration() {
    console.log('🚀 Starting tags system migration...\n');

    try {
        const migrationPath = path.join(__dirname, '../migrations/20260112_tags.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        // Split by semicolons for statement-by-statement execution
        // Note: usage of exec_sql requires a postgres function 'exec_sql(sql text)' to be defined.
        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];

            // Skip comments and empty lines
            if (statement.startsWith('--') || statement.trim().length === 0) {
                continue;
            }

            try {
                console.log(`⏳ Executing statement ${i + 1}...`);

                const { error } = await supabase.rpc('exec_sql', {
                    sql: statement
                });

                if (error) {
                    // Check if "already exists" to ignore
                    if (error.message?.includes('already exists')) {
                        console.log(`✓ (already exists)`);
                        successCount++;
                    } else {
                        throw error;
                    }
                } else {
                    console.log(`✓ Success`);
                    successCount++;
                }
            } catch (error) {
                console.error(`✗ Error executing statement:`, error.message);

                // Fallback attempt: if exec_sql is missing, user must run manually.
                if (error.message.includes('function exec_sql') && error.message.includes('does not exist')) {
                    console.error('\nCRITICAL: function exec_sql(text) does not exist on the database.');
                    console.error('You must run the SQL manually in Supabase Dashboard.');
                    process.exit(1);
                }
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log(`✅ Migration process finished!`);
        console.log(`   Success: ${successCount}`);
        console.log(`   Errors: ${errorCount}`);
        console.log('='.repeat(50) + '\n');

        if (errorCount > 0) {
            console.log('⚠️  Some statements failed. Please check the logs.');
            console.log('💡 You may need to run the SQL file manually in Supabase SQL Editor:');
            console.log(`   ${migrationPath}\n`);
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

applyMigration().catch(console.error);
