const axios = require('axios');

async function testInvalidJson() {
    try {
        // Mimic the Bubble request with invalid JSON that might trigger the parser error
        // sending it as text/plain or application/json but passing raw string
        const response = await axios.post('http://localhost:5001/api/webhook/bubble/message',
            '{ "some": "invalid", json }', // Intentionally bad JSON
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Token': process.env.BUBBLE_WEBHOOK_SECRET || 'test_secret' // Assuming default or env
                },
                transformRequest: [(data) => data] // Prevent axios from stringifying, send raw
            }
        );
        console.log('Response:', response.data);
    } catch (error) {
        console.log('Error Status:', error.response?.status);
        console.log('Error Data:', error.response?.data);
    }
}

testInvalidJson();
