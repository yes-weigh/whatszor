import { prisma } from './src/prisma/client';
import { env } from './src/env';
import jwt from 'jsonwebtoken';
import axios from 'axios';

async function run() {
    // 1. Fetch user fazal@main.com 
    const user = await prisma.user.findFirst({
        where: { email: 'fazal@main.com' },
        include: { memberships: { include: { workspace: true } } }
    });
    if (!user) throw new Error('user not found');
    
    // 2. Mock payload
    const payload = {
        sub: user.id,
        email: user.email,
        workspaceId: user.memberships[0].workspaceId,
        role: user.memberships[0].role
    };

    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Forged token');

    try {
        const accountRes = await axios.post('http://localhost:3001/api/v1/whatsapp/sessions', {
            name: 'test-account-forged'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Account response:', accountRes.data);
    } catch (e: any) {
        if (e.response) {
            console.error('API Error:', JSON.stringify(e.response.data, null, 2));
        } else {
            console.error('Network Error:', e.message);
        }
    }
}
run().catch(console.error);
