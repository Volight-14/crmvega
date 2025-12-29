const https = require('https');

const API_KEY = 'b897577858b2a032515db52f77e15e38';
const SEARCH_VALUE = '21281613'; // lead_id from the screenshot

async function fetchData(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.response.results);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function searchOrder() {
    console.log(`Searching for Order matching ${SEARCH_VALUE}...`);
    // Get sorting by date DESC to look at recent ones, and ASC for old ones
    // But let's just create a loop to fetch a few pages

    let found = false;
    let cursor = 0;
    while (!found && cursor < 500) { // Limit to 500 items for check
        const url = `https://vega-ex.com/api/1.1/obj/Order?limit=100&cursor=${cursor}`;
        const orders = await fetchData(url);

        console.log(`Checking orders ${cursor} to ${cursor + orders.length}`);

        for (const order of orders) {
            // Check if main_ID matches
            if (String(order.main_ID) === SEARCH_VALUE) {
                console.log('FOUND MATCH by main_ID!');
                console.log(JSON.stringify(order, null, 2));
                found = true;
                break;
            }

            // Iterate all values to find ANY match
            const values = Object.values(order);
            if (values.some(v => String(v).includes(SEARCH_VALUE))) {
                console.log('FOUND MATCH in some field!');
                console.log(JSON.stringify(order, null, 2));
                found = true;
                break;
            }

            // Also check for missing main_ID
            if (!order.main_ID) {
                console.log('Found Order without main_ID:');
                console.log(JSON.stringify(order, null, 2));
            }
        }

        cursor += 100;
        if (orders.length < 100) break;
    }
}

searchOrder();
