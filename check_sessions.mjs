import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://postgres:password@localhost:5432/yesbheem' } }
});

async function main() {
    const total = await prisma.conversation.count();
    const nullSess = await prisma.conversation.count({ where: { sessionId: null } });
    const sample = await prisma.conversation.findMany({ take: 3, select: { sessionId: true } });
    const accounts = await prisma.whatsAppAccount.findMany({ select: { sessionId: true, status: true } });
    console.log({ total, nullSess, sampleSessionIds: sample.map(s => s.sessionId), accounts });
}

main().catch(console.error).finally(() => prisma.$disconnect());
