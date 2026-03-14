import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const campaigns = await prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
            members: {
                select: { id: true, status: true, errorReason: true, messageId: true }
            }
        }
    });

    console.dir(campaigns, { depth: null });

    const messages = await prisma.message.findMany({
        where: { id: { in: campaigns[0]?.members.map(m => m.messageId).filter(Boolean) as string[] } },
        select: { id: true, status: true, content: true }
    });

    console.dir(messages, { depth: null });
}

main().catch(console.error).finally(() => prisma.$disconnect());
