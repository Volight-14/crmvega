require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const TOKEN = 'b897577858b2a032515db52f77e15e38';
const BASE_URL = 'https://vega-ex.com/version-live/api/1.1/obj';
const CONCURRENCY = 5;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Helper for delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchBubbleOrder(mainId) {
    try {
        const constraints = JSON.stringify([
            { key: 'main_ID', constraint_type: 'equals', value: String(mainId) }
        ]);
        const res = await axios.get(`${BASE_URL}/Order`, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            params: { constraints },
            timeout: 10000
        });
        return res.data.response.results[0] || null;
    } catch (err) {
        if (err.response && err.response.status === 404) return null;
        console.error(`[Bubble Order Error] ${mainId}:`, err.message);
        return null;
    }
}

async function fetchBubbleUser(userId) {
    try {
        const res = await axios.get(`${BASE_URL}/User/${userId}`, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            timeout: 10000
        });
        return res.data.response || null;
    } catch (err) {
        if (err.response && err.response.status === 404) return null;
        console.error(`[Bubble User Error] ${userId}:`, err.message);
        return null;
    }
}

async function processOrder(crmOrder) {
    const { id: crmId, main_id, contact_id } = crmOrder;

    if (!main_id) {
        // console.log(`[SKIP] Order ${crmId}: No main_id`);
        return;
    }

    // 1. Fetch Order from Bubble
    const bubbleOrder = await fetchBubbleOrder(main_id);

    if (!bubbleOrder) {
        console.log(`[SKIP] Order ${crmId} (main_id: ${main_id}): Not found in Bubble`);
        return;
    }

    const bubbleUserId = bubbleOrder.User;
    if (!bubbleUserId) {
        console.log(`[SKIP] Order ${crmId} (main_id: ${main_id}): No User field in Bubble`);
        return;
    }

    // 2. Fetch User from Bubble
    const bubbleUser = await fetchBubbleUser(bubbleUserId);
    if (!bubbleUser) {
        console.log(`[SKIP] Order ${crmId}: User ${bubbleUserId} not found in Bubble`);
        return;
    }

    const telegramId = bubbleUser.TelegramID;
    if (!telegramId) {
        console.log(`[SKIP] Order ${crmId}: Bubble User ${bubbleUserId} has no TelegramID`);
        return;
    }

    const telegramIdStr = String(telegramId).trim();

    // 3. Find Contact in Supabase
    const { data: existingContact } = await supabase
        .from('contacts')
        .select('id, name, telegram_user_id')
        .eq('telegram_user_id', telegramIdStr)
        .maybeSingle();

    let targetContactId = null;

    if (existingContact) {
        targetContactId = existingContact.id;
        // console.log(`[FOUND] Order ${crmId}: Contact exists (${existingContact.name}, ID: ${targetContactId})`);
    } else {
        // 4. Create Contact if not found
        const firstName = bubbleUser.FirstName || '';
        const lastName = bubbleUser.LastName || '';
        let name = [firstName, lastName].filter(Boolean).join(' ');

        if (!name) name = bubbleUser.AmoName || bubbleUser.TelegramUsername || `User ${telegramId}`;

        const newContactRaw = {
            name: name,
            telegram_user_id: telegramIdStr,
            telegram_username: bubbleUser.TelegramUsername,
            email: bubbleUser.authentication?.email?.email,
            status: 'active'
        };

        const { data: newContact, error } = await supabase
            .from('contacts')
            .insert(newContactRaw)
            .select()
            .single();

        if (error) {
            console.error(`[ERROR] Failed to create contact for TG ${telegramId}:`, error.message);
            return;
        }

        targetContactId = newContact.id;
        console.log(`[CREATED] Order ${crmId}: Created contact ${name} (TG: ${telegramId})`);
    }

    // 5. Link Order to Contact if different
    if (targetContactId && String(targetContactId) !== String(contact_id)) {
        const { error: updateError } = await supabase
            .from('orders')
            .update({ contact_id: targetContactId })
            .eq('id', crmId);

        if (updateError) {
            console.error(`[ERROR] Failed to update order ${crmId}:`, updateError.message);
        } else {
            console.log(`[LINKED] Order ${crmId} (main_id: ${main_id}) -> Contact ${targetContactId}`);
        }
    } else {
        // console.log(`[OK] Order ${crmId} already linked correctly.`);
    }
}

async function run() {
    console.log('Starting Full Sync Bubble -> CRM...');

    // Fetch all orders
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, main_id, contact_id')
        .not('main_id', 'is', null);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Processing ${orders.length} orders...`);

    // Simple concurrency loop
    for (let i = 0; i < orders.length; i += CONCURRENCY) {
        const chunk = orders.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(processOrder));

        // Progress Log
        if ((i + CONCURRENCY) % 50 === 0) {
            console.log(`Processed ${Math.min(i + CONCURRENCY, orders.length)} / ${orders.length}`);
        }
    }

    console.log('Done.');
}

run();
