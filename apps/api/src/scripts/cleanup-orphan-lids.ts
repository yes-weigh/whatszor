/**
 * cleanup-orphan-lids.ts
 *
 * Deletes conversations (and their messages) that are stuck with @lid providerIds
 * and belong to sessions that no longer exist in the WhatsAppAccount table.
 *
 * These are truly unresolvable: the session that created them is deleted and
 * no other session has the LID mapping for those accounts.
 *
 * Run: npx ts-node --project tsconfig.json src/scripts/cleanup-orphan-lids.ts
 */
import { prisma } from '../prisma/client';

async function main() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║   Orphan LID Conversation Cleanup                ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // 1. Find all active session IDs
    const activeSessions = await prisma.whatsAppAccount.findMany({
        where: { deletedAt: null },
        select: { sessionId: true, phoneNumber: true },
    });
    const activeSessionIds = activeSessions.map(s => s.sessionId);
    console.log(`Active sessions: ${activeSessions.map(s => `${s.phoneNumber} (${s.sessionId.slice(0, 8)}...)`).join(', ')}`);

    // 2. Find ALL @lid conversations
    const orphanLids = await prisma.conversation.findMany({
        where: { providerId: { endsWith: '@lid' } },
        select: { id: true, providerId: true, sessionId: true },
    });

    console.log(`\nTotal @lid conversations in DB: ${orphanLids.length}`);

    if (orphanLids.length === 0) {
        console.log('Nothing to clean up!');
        return;
    }

    const actuallyOrphaned = orphanLids.filter(lid => lid.sessionId === null || !activeSessionIds.includes(lid.sessionId));
    const activeAttached = orphanLids.filter(lid => lid.sessionId !== null && activeSessionIds.includes(lid.sessionId));

    console.log(`Of those:`);
    console.log(`  - Attached to Active Session: ${activeAttached.length} (These are NOT orphans)`);
    console.log(`  - Attached to Deleted/Null Session: ${actuallyOrphaned.length} (These ARE orphans)`);

    // Let's print out the active attached ones to see why they are still here!
    if (activeAttached.length > 0) {
        console.log(`\nSample of LIDs still attached to active session ${activeSessionIds[0]}:`);
        console.log(activeAttached.slice(0, 3));
    }

    if (actuallyOrphaned.length === 0) return;

    const orphanIds = actuallyOrphaned.map(c => c.id);

    // 3. Delete messages first (FK constraint)
    const deletedMessages = await prisma.message.deleteMany({
        where: { conversationId: { in: orphanIds } },
    });
    console.log(`\nDeleted ${deletedMessages.count} orphan messages`);

    // 4. Delete the conversations
    const deletedConvs = await prisma.conversation.deleteMany({
        where: { id: { in: orphanIds } },
    });
    console.log(`Deleted ${deletedConvs.count} orphan conversations`);
    console.log('\n✅ Cleanup complete');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
