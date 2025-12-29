const https = require('https');
const fs = require('fs');

const API_KEY = 'b897577858b2a032515db52f77e15e38';
const TYPES = [
    { name: 'Order', url: 'https://vega-ex.com/api/1.1/obj/Order', idField: 'main_ID' },
    { name: 'Chats Messages', url: 'https://vega-ex.com/api/1.1/obj/Chats%20Messages', idField: 'Main_ID' }
];

async function fetchData(type) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        };
        // Fetch a larger batch to increase chance of finding old/weird data
        // Sorting by Created Date ascending might get us older records?
        // Bubble API sort: &sort_field=Created Date&descending=false
        const url = `${type.url}?limit=100&sort_field=Created Date&descending=false`;

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

async function analyze() {
    for (const type of TYPES) {
        console.log(`\nAnalyzing ${type.name}...`);
        try {
            const results = await fetchData(type);
            const missingId = results.filter(r => !r[type.idField]);

            console.log(`Total fetched: ${results.length}`);
            console.log(`Missing ${type.idField}: ${missingId.length}`);

            if (missingId.length > 0) {
                console.log('Sample record without ID:');
                console.log(JSON.stringify(missingId[0], null, 2));

                // Collect potential linking keys
                const keys = Object.keys(missingId[0]).sort();
                console.log('Available keys in missing ID record:', keys.join(', '));
            } else {
                console.log('No records found missing the ID in this batch.');
            }
        } catch (e) {
            console.error(`Error analyzing ${type.name}:`, e.message);
        }
    }
}

analyze();
