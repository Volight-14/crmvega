const https = require('https');

const API_KEY = 'b897577858b2a032515db52f77e15e38';
const URL = 'https://vega-ex.com/api/1.1/obj/Order?limit=100';

function fetchOrders() {
    return new Promise((resolve, reject) => {
        const options = {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        };

        https.get(URL, options, (res) => {
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

async function main() {
    console.log('Fetching orders from Bubble...');
    try {
        const orders = await fetchOrders();
        console.log(`Fetched ${orders.length} orders.`);

        const allKeys = new Set();
        orders.forEach(order => {
            Object.keys(order).forEach(key => allKeys.add(key));
        });

        console.log('\nAll Unique Keys Found:');
        const sortedKeys = Array.from(allKeys).sort();
        console.log(JSON.stringify(sortedKeys, null, 2));

        // Optional: Show value types for each key from a sample
        console.log('\nSample Values (from first record with value):');
        const sampleValues = {};
        sortedKeys.forEach(key => {
            const orderWithValue = orders.find(o => o[key] !== null && o[key] !== undefined && o[key] !== '');
            if (orderWithValue) {
                sampleValues[key] = orderWithValue[key];
            } else {
                sampleValues[key] = 'null/undefined in batch';
            }
        });
        console.log(JSON.stringify(sampleValues, null, 2));

    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
