import { prisma } from '../prisma/client';

async function main() {
    const lids = await prisma.conversation.findMany({
        where: { providerId: { endsWith: '@lid' } },
        select: { id: true, providerId: true, sessionId: true, waContactName: true },
    });

    console.log(`\n@lid conversations in DB: ${lids.length}`);
    if (lids.length > 0) {
        console.log(JSON.stringify(lids.slice(0, 20), null, 2));
    }

    const sessions = await prisma.whatsAppAccount.findMany({
        select: { sessionId: true, phoneNumber: true, status: true },
    });
    console.log(`\nAll sessions: ${JSON.stringify(sessions, null, 2)}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
