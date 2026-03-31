import { registerUser } from './src/modules/auth/auth.service';
import { prisma } from './src/prisma/client';

async function test() {
    try {
        console.log('Testing registration...');
        const res = await registerUser({
            name: 'Tester',
            email: 'test-' + Date.now() + '@example.com',
            password: 'password1234',
            workspaceName: 'Test Workspace',
            workspaceSlug: 'test-ws-' + Date.now()
        });
        console.log('Registration success:', res);
    } catch (err: any) {
        console.error('Registration failed!');
        console.error('Error Code:', err.code);
        console.error('Status Code:', err.statusCode);
        console.error('Message:', err.message);
        console.error('Stack:', err.stack);
    } finally {
        await prisma.$disconnect();
    }
}

test();
