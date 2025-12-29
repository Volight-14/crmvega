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
                    resolve([]);
                }
            });
        }).on('error', reject);
    });
}

async function getAllKeys() {
    console.log('Fetching recent orders...');
    const recent = await fetchData('https://vega-ex.com/api/1.1/obj/Order?limit=50&sort_field=Created Date&descending=true');

    console.log('Fetching old orders...');
    const old = await fetchData('https://vega-ex.com/api/1.1/obj/Order?limit=50&sort_field=Created Date&descending=false');

    const allKeySet = new Set();

    [...recent, ...old].forEach(order => {
        Object.keys(order).forEach(key => allKeySet.add(key));
    });

    const sortedKeys = [...allKeySet].sort();
    console.log('\nALL FOUND ORDER KEYS:');
    console.log(JSON.stringify(sortedKeys, null, 2));
}

getAllKeys();
