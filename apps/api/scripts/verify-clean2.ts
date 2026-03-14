/**
 * E2E Verify Clean - Phase 1 check
 * Run: npx ts-node --esm scripts/verify-clean2.ts
 * OR: npx tsx --tsconfig tsconfig.json scripts/verify-clean2.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('\n🔵 Phase 1 — Clean System Reset Verification\n');

    const checks: Array<{ table: string; fn: () => Promise<number> }> = [
        { table: 'user',                fn: () => prisma.user.count() },
        { table: 'workspace',           fn: () => prisma.workspace.count() },
        { table: 'workspaceMember',     fn: () => prisma.workspaceMember.count() },
        { table: 'contact',             fn: () => prisma.contact.count() },
        { table: 'audience',            fn: () => prisma.audience.count() },
        { table: 'audienceMember',      fn: () => prisma.audienceMember.count() },
        { table: 'campaign',            fn: () => prisma.campaign.count() },
        { table: 'campaignMember',      fn: () => prisma.campaignMember.count() },
        { table: 'conversation',        fn: () => prisma.conversation.count() },
        { table: 'message',             fn: () => prisma.message.count() },
        { table: 'whatsAppSession',     fn: () => prisma.whatsAppSession.count() },
        { table: 'automationRule',      fn: () => prisma.automationRule.count() },
        { table: 'automationExecution', fn: () => prisma.automationExecution.count() },
        { table: 'eventLog',            fn: () => prisma.eventLog.count() },
    ];

    let clean = 0;
    let dirty = 0;

    for (const { table, fn } of checks) {
        const count = await fn();
        if (count === 0) {
            console.log(`  ✅ ${table}: EMPTY`);
            clean++;
        } else {
            console.log(`  ⚠️  ${table}: ${count} rows REMAIN`);
            dirty++;
        }
    }

    console.log(`\n📊 Result: ${clean} tables clean, ${dirty} tables non-empty`);
    
    if (dirty === 0) {
        console.log('\n✅ PHASE 1 COMPLETE — System is clean and empty for E2E testing.\n');
    } else {
        console.log('\n❌ Some tables still contain data. Run prisma migrate reset --force to wipe all data.\n');
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
