import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://postgres:password@localhost:5432/yesbheem' } }
});

async function main() {
    console.log("Starting deep cleanup...");

    // Delete all messages and conversations
    console.log("Deleting messages...");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE messages CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE conversations CASCADE`);

    // Delete all WhatsApp accounts (CRM linked) and Baileys sessions
    console.log("Deleting accounts & sessions...");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE whatsapp_accounts CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE whatsapp_sessions CASCADE`);

    console.log("Cleanup complete. The database is a completely clean slate.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
