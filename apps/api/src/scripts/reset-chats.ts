/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("⚠️ Deleting all conversations and messages...");
    
    // Deleting conversations will cascade and delete all associated messages
    const result = await prisma.conversation.deleteMany({});
    
    console.log(`✅ Successfully deleted ${result.count} conversations and their message histories.`);
    console.log("Next time a message is sent or received, conversations will be rebuilt with strict session separation.");
}

main()
    .catch((e) => {
        console.error("❌ Error deleting conversations:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
