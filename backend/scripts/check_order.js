const axios = require('axios');

async function checkOrder() {
    try {
        const response = await axios.get('https://vega-ex.com/api/1.1/obj/Order', {
            headers: { Authorization: 'Bearer b897577858b2a032515db52f77e15e38' },
            params: {
                constraints: JSON.stringify([
                    { key: 'main_ID', constraint_type: 'equals', value: '1767427300751' }
                ]),
                limit: 1
            }
        });

        const order = response.data.response.results[0];
        if (!order) {
            console.log('Order not found');
            return;
        }

        console.log('=== ORDER INFO ===');
        console.log('User field:', order.User);
        console.log('_id:', order._id);
        console.log('main_ID:', order.main_ID);
        console.log('\n=== ALL FIELDS ===');
        console.log(Object.keys(order).sort().join('\n'));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkOrder();
