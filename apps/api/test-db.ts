import { prisma } from './src/prisma/client';

async function test() {
    try {
        const adminWorkspaces = await prisma.workspace.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                members: {
                    where: { role: 'OWNER' },
                    include: { user: { select: { name: true, email: true } } }
                },
                _count: {
                    select: { whatsAppAccounts: true, members: true }
                }
            }
        });
        console.log("adminWorkspaces returned from getWorkspaces:");
        console.dir(adminWorkspaces, { depth: null });
    } catch (err) {
        console.error("DB Query Error:", err);
    } finally {
        await prisma.$disconnect();
    }
}
test();
