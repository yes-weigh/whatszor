import { prisma } from './src/prisma/client';

async function main() {
    const latestMessage = await prisma.message.findFirst({
        where: { type: 'TEMPLATE', direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(latestMessage, null, 2));
}

main();
