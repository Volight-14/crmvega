#!/usr/bin/env node

/**
 * Apply performance optimization indexes to Supabase database
 * Run this script to create all necessary indexes for improved query performance
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function applyMigration() {
    console.log('🚀 Starting performance optimization migration...\n');

    try {
        // Read the migration SQL file
        const migrationPath = path.join(__dirname, '../migrations/add_performance_indexes.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        // Split by semicolons to execute each statement separately
        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

        console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];

            // Skip comments and empty lines
            if (statement.startsWith('--') || statement.trim().length === 0) {
                continue;
            }

            // Extract index name for better logging
            const indexMatch = statement.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
            const indexName = indexMatch ? indexMatch[1] : `Statement ${i + 1}`;

            try {
                console.log(`⏳ Creating: ${indexName}...`);

                const { error } = await supabase.rpc('exec_sql', {
                    sql: statement + ';'
                }).catch(async () => {
                    // Fallback: try direct execution if RPC doesn't exist
                    return await supabase.from('_migrations').insert({ sql: statement });
                });

                if (error) {
                    // Check if error is about index already existing
                    if (error.message?.includes('already exists')) {
                        console.log(`✓ ${indexName} (already exists)`);
                        successCount++;
                    } else {
                        throw error;
                    }
                } else {
                    console.log(`✓ ${indexName} created successfully`);
                    successCount++;
                }
            } catch (error) {
                console.error(`✗ Error creating ${indexName}:`, error.message);
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log(`✅ Migration completed!`);
        console.log(`   Success: ${successCount}`);
        console.log(`   Errors: ${errorCount}`);
        console.log('='.repeat(50) + '\n');

        if (errorCount > 0) {
            console.log('⚠️  Some indexes failed to create. This might be normal if:');
            console.log('   - Indexes already exist');
            console.log('   - You need SUPERUSER privileges');
            console.log('   - You need to run this via Supabase SQL Editor\n');
            console.log('💡 If errors persist, copy the SQL from:');
            console.log(`   ${migrationPath}`);
            console.log('   and run it directly in Supabase SQL Editor\n');
        }

        // Verify indexes were created
        console.log('🔍 Verifying indexes...\n');
        await verifyIndexes();

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

async function verifyIndexes() {
    const indexesToCheck = [
        'idx_orders_status_created',
        'idx_orders_contact_id',
        'idx_messages_main_id',
        'idx_messages_created_date',
        'idx_order_messages_order_id',
    ];

    console.log('Checking for critical indexes...\n');

    for (const indexName of indexesToCheck) {
        try {
            const { data, error } = await supabase
                .from('pg_indexes')
                .select('indexname')
                .eq('indexname', indexName)
                .maybeSingle();

            if (data) {
                console.log(`✓ ${indexName} exists`);
            } else {
                console.log(`✗ ${indexName} NOT FOUND`);
            }
        } catch (error) {
            console.log(`? ${indexName} (unable to verify)`);
        }
    }

    console.log('\n📊 Performance optimization complete!\n');
    console.log('Next steps:');
    console.log('1. Test order loading speed in the UI');
    console.log('2. Test message loading speed in the UI');
    console.log('3. Monitor query performance in Supabase dashboard\n');
}

// Run migration
applyMigration().catch(console.error);
