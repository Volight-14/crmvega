const https = require('https');

const API_KEY = 'b897577858b2a032515db52f77e15e38';

async function fetchData(url) {
    return new Promise((resolve, reject) => {
        const options = { headers: { 'Authorization': `Bearer ${API_KEY}` } };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.response.results);
                } catch (e) {
                    console.error('Error parsing JSON:', e);
                    resolve([]);
                }
            });
        }).on('error', reject);
    });
}

async function findCorrelation() {
    console.log('Fetching messages...');
    // Fetch messages with lead_id
    const msgsUrl = 'https://vega-ex.com/api/1.1/obj/Chats%20Messages?limit=100&constraints=[{"key":"lead_id","constraint_type":"not_empty"}]';
    // Since constraints syntax is tricky with curl/node without correct encoding, let's just fetch latest
    const msgs = await fetchData('https://vega-ex.com/api/1.1/obj/Chats%20Messages?limit=100&sort_field=Created Date&descending=true');

    const leadIds = new Set();
    msgs.forEach(m => {
        if (m.lead_id) leadIds.add(String(m.lead_id));
    });
    console.log(`Collected ${leadIds.size} unique lead_ids from ${msgs.length} messages.`);
    console.log('Sample lead_ids:', [...leadIds].slice(0, 5));

    console.log('Fetching orders...');
    let orderCursor = 0;
    let foundMatch = false;

    // Check first 1000 orders
    while (orderCursor < 1000) {
        const orders = await fetchData(`https://vega-ex.com/api/1.1/obj/Order?limit=100&cursor=${orderCursor}&sort_field=Created Date&descending=true`); // Check recent orders first

        console.log(`Checking orders ${orderCursor} to ${orderCursor + orders.length}`);

        for (const order of orders) {
            const orderValues = Object.values(order).map(String);

            for (const val of orderValues) {
                if (leadIds.has(val)) {
                    console.log('--------------------------------------------------');
                    console.log('FOUND MATCH!');
                    console.log(`Message lead_id: ${val}`);
                    console.log('Matching Order Record:');
                    console.log(JSON.stringify(order, null, 2));

                    // Identify which key matched
                    const matchingKey = Object.keys(order).find(key => String(order[key]) === val);
                    console.log(`Matching Key in Order: ${matchingKey}`);
                    foundMatch = true;
                }
            }
        }

        if (foundMatch) break; // Stop after finding some matches to analyze

        if (orders.length < 100) break;
        orderCursor += 100;
    }

    if (!foundMatch) {
        console.log('No direct matches found in first 1000 orders.');
    }
}

findCorrelation();
