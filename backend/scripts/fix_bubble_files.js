const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY is missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixMessages() {
    console.log('Starting migration to fix Bubble file messages...');

    const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .is('file_url', null)
        .ilike('content', '%cdn.bubble.io%')
    // .or('message_type.eq.text,message_type.is.null') // Removed restriction

    if (error) {
        console.error('Error fetching messages:', error);
        return;
    }

    console.log(`Found ${messages.length} potential messages to scan.`);

    let updatedCount = 0;
    // Regex: Find http(s) URL ending with file extension, allowing for query params
    const fileUrlRegex = /(https?:\/\/[^\s]+)\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|mp3|ogg|wav|mp4|mov|webm)(?:\?[^\s]*)?/i;

    let skippedSamples = 0;

    for (const msg of messages) {
        if (!msg.content) continue;

        const match = msg.content.match(fileUrlRegex);

        if (match) {
            const fullUrl = match[0];
            const cleanUrl = fullUrl;

            const fileName = decodeURIComponent(cleanUrl.split('/').pop().split('?')[0]);
            const ext = fileName.split('.').pop().toLowerCase();

            let newType = 'file';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) newType = 'image';
            else if (['mp3', 'ogg', 'wav'].includes(ext)) newType = 'voice';
            else if (['mp4', 'mov', 'webm'].includes(ext)) newType = 'video';

            let newContent = msg.content.replace(fullUrl, '').trim();

            console.log(`Fixing Message ID ${msg.id}:`);
            console.log(`  - Old Content: "${msg.content}"`);
            console.log(`  - Detected URL: ${cleanUrl}`);
            console.log(`  - New Type: ${newType}`);

            const { error: updateError } = await supabase
                .from('messages')
                .update({
                    file_url: cleanUrl,
                    file_name: fileName,
                    message_type: newType,
                    content: newContent
                })
                .eq('id', msg.id);

            if (updateError) {
                console.error(`  [ERROR] Failed update:`, updateError.message);
            } else {
                console.log(`  [OK] Updated.`);
                updatedCount++;
            }
        } else {
            if (skippedSamples < 5) {
                console.log(`[SKIP] ID ${msg.id} content: "${msg.content}"`);
                skippedSamples++;
            }
        }
    }

    console.log(`Migration complete. Updated ${updatedCount} messages.`);
}

fixMessages();
