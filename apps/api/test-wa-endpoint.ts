import axios from 'axios';

async function run() {
    try {
        // Test credentials (make sure to match your setup)
        const credentials = {
            email: 'fazal@main2.com',
            password: 'password123',
            workspaceSlug: 'main2'
        };
        const res = await axios.post('http://localhost:3001/api/v1/auth/login', credentials);
        
        const token = res.data.data.accessToken;
        console.log('Got token', token.slice(0, 20) + '...');

        const accountRes = await axios.post('http://localhost:3001/api/v1/whatsapp/sessions', {
            name: 'test-account-v2'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('--- Triggering Connection ---');
        try {
            const waId = 'd17fca2d-3e5f-4daf-a68d-10671c532ddf';
            const connectRes = await axios.post(`http://localhost:3001/api/v1/whatsapp/sessions/${waId}/connect`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Connect Success:', connectRes.data);
        } catch (e: any) {
            console.log('Connect Error:', e.response?.data || e.message);
        }
    } catch (e: any) {
        if (e.response) {
            console.error('API Error:', JSON.stringify(e.response.data, null, 2));
        } else {
            console.error('Network Error:', e.message);
        }
    }
}

run();
