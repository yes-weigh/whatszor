import { prisma } from './src/prisma/client';

async function main() {
    const latestFailed = await prisma.message.findFirst({
        where: { direction: 'OUTBOUND', status: 'FAILED' },
        orderBy: { createdAt: 'desc' }
    });
    console.log("Latest Failed:", JSON.stringify(latestFailed, null, 2));

    const latestQueued = await prisma.message.findFirst({
        where: { direction: 'OUTBOUND', status: 'QUEUED' },
        orderBy: { createdAt: 'desc' }
    });
    console.log("Latest Queued:", JSON.stringify(latestQueued, null, 2));
}

main();
