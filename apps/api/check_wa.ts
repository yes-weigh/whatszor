import { prisma } from './src/prisma/client';

async function check() {
    try {
        const accs = await prisma.whatsAppAccount.findMany({
            where: { workspace: { members: { some: { user: { email: 'fazal@yesweigh.in' } } } } }
        });
        console.log(JSON.stringify(accs.map(a => ({ id: a.id, name: a.name, phone: a.phoneNumber, status: a.status })), null, 2));
    } finally {
        await prisma.$disconnect();
    }
}
check();
