import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function run() {
    try {
        const workspaceId = (await prisma.workspace.findFirst())?.id;
        const userId = (await prisma.user.findFirst())?.id;

        if (!workspaceId || !userId) {
            console.log("No workspace or user found");
            return;
        }

        const sessionId = randomUUID();

        const data = {
            sessionId,
            name: 'test',
            status: 'DISCONNECTED' as any,
            label: null,
            phoneNumber: null,
            botMode: null,
            lastActiveAt: null,
            workspaceId,
            userId
        };

        const res = await prisma.whatsAppAccount.create({ data });
        console.log("Success:", res);

    } catch (err: any) {
        console.error("Failed to create:", err.message);
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

run();
