import { prisma } from './src/prisma/client';

async function main() {
    const recentMessages = await prisma.message.findMany({
        where: { direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log("Recent 5 Outbound Messages:", JSON.stringify(recentMessages, null, 2));
}

main();
