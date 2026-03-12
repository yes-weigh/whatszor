/**
 * Deep cleanup script — wipes all conversation/message data and resets WhatsApp sessions.
 * Run with: pnpm --filter api exec tsx scripts/db-cleanup.ts
 */
import { prisma } from '../src/prisma/client.js';

async function main() {
    console.log('🧹 Starting deep database cleanup...\n');

    // 1. Delete all messages
    const msgs = await prisma.message.deleteMany({});
    console.log(`✅ Deleted ${msgs.count} messages`);

    // 2. Delete all conversations
    const convs = await prisma.conversation.deleteMany({});
    console.log(`✅ Deleted ${convs.count} conversations`);

    // 3. Wipe all Baileys session auth keys (so every account will need to re-scan QR)
    const sessions = await prisma.whatsAppSession.deleteMany({});
    console.log(`✅ Deleted ${sessions.count} Baileys auth session records`);

    // 4. Reset all WhatsApp accounts to DISCONNECTED
    const accounts = await prisma.whatsAppAccount.updateMany({
        data: { status: 'DISCONNECTED' },
    });
    console.log(`✅ Reset ${accounts.count} WhatsApp accounts to DISCONNECTED`);

    console.log('\n🎉 Cleanup complete! Start pnpm dev and re-scan QR codes to reconnect.');
}

main()
    .catch(e => { console.error('❌ Cleanup failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
