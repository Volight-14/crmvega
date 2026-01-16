require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const TOKEN = 'b897577858b2a032515db52f77e15e38';
const BASE_URL = 'https://vega-ex.com/version-live/api/1.1/obj';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixSpecificOrder(mainId) {
    console.log(`Fixing Order: ${mainId}`);

    // 1. Fetch Order from Bubble (to get the User ID)
    let bubbleUserId = null;
    try {
        const constraints = JSON.stringify([
            { key: 'main_ID', constraint_type: 'equals', value: String(mainId) }
        ]);
        const res = await axios.get(`${BASE_URL}/Order`, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            params: { constraints }
        });

        const results = res.data.response.results;
        if (results.length > 0) {
            bubbleUserId = results[0].User;
            console.log(`Found Bubble User ID: ${bubbleUserId}`);
        } else {
            console.log('Order not found in Bubble');
            return;
        }

    } catch (err) {
        console.error('Bubble API Error:', err.message);
        return;
    }

    if (!bubbleUserId) {
        console.log('No User field in Bubble Order');
        return;
    }

    // 2. Fetch User Details (The FIX)
    let telegramId = null;
    let userData = {};

    try {
        // Check if it's already a TG ID (digits)
        if (/^\d+$/.test(bubbleUserId) && bubbleUserId.length < 15) {
            telegramId = bubbleUserId;
        } else {
            // Fetch from Bubble API
            console.log(`Fetching details for User ${bubbleUserId}...`);
            const userRes = await axios.get(`${BASE_URL}/User/${bubbleUserId}`, {
                headers: { Authorization: `Bearer ${TOKEN}` }
            });
            const u = userRes.data.response;
            telegramId = u.TelegramID;
            console.log(`Resolved TelegramID: ${telegramId}`);

            userData = {
                firstName: u.FirstName,
                lastName: u.LastName,
                amoName: u.AmoName,
                username: u.TelegramUsername,
                email: u.authentication?.email?.email
            };
        }
    } catch (err) {
        console.error('Error fetching user:', err.message);
        return;
    }

    if (!telegramId) {
        console.log('Could not resolve TelegramID');
        return;
    }

    // 3. Find or Create Contact in CRM
    let contactId = null;

    // Find
    const { data: existing } = await supabase
        .from('contacts')
        .select('id, name')
        .eq('telegram_user_id', String(telegramId))
        .maybeSingle();

    if (existing) {
        contactId = existing.id;
        console.log(`Found CRM Contact: ${existing.name} (${existing.id})`);
    } else {
        // Create
        const name = [userData.firstName, userData.lastName].filter(Boolean).join(' ')
            || userData.amoName
            || userData.username
            || `User ${telegramId}`;

        console.log(`Creating new contact: ${name}`);
        const { data: newContact, error } = await supabase
            .from('contacts')
            .insert({
                name,
                telegram_user_id: String(telegramId),
                email: userData.email,
                telegram_username: userData.username,
                status: 'active'
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating contact:', error);
            return;
        }
        contactId = newContact.id;
        console.log(`Created Contact ID: ${contactId}`);
    }

    // 4. Link Order in CRM
    if (contactId) {
        const { error: updateError } = await supabase
            .from('orders')
            .update({ contact_id: contactId })
            .eq('main_id', mainId);

        if (updateError) {
            console.error('Error updating order:', updateError);
        } else {
            console.log(`SUCCESS: Linked Order ${mainId} to Contact ${contactId}`);
        }
    }
}

fixSpecificOrder('1768496996937');
