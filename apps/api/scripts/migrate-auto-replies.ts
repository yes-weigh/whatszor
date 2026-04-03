import { PrismaClient, MatchType } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateAutoReplies() {
    console.log('--- Starting Migration: Legacy AutoReplies to KeywordAutomations ---');

    // Fetch all QuickReplies that act as Auto Replies
    const autoReplies = await prisma.quickReply.findMany({
        where: {
            isAutoReply: true,
            keyword: { not: null },
        },
    });

    console.log(`Found ${autoReplies.length} legacy Auto Replies to migrate.`);

    let migrated = 0;
    let skipped = 0;

    for (const ar of autoReplies) {
        if (!ar.keyword) continue;

        try {
            // Check idempotency: Have we already migrated this specific QuickReply?
            const existing = await prisma.keywordAutomation.findUnique({
                where: { legacyId: ar.id },
            });

            if (existing) {
                console.log(`[SKIPPED] Legacy ID ${ar.id} already migrated as ${existing.id}`);
                skipped++;
                continue;
            }

            // Create new KeywordAutomation
            const kw = await prisma.keywordAutomation.create({
                data: {
                    workspaceId: ar.workspaceId,
                    keyword: ar.keyword.trim().toLowerCase(),
                    matchType: MatchType.CONTAINS,
                    priority: 0,
                    isActive: true,
                    // If templateId exists, replyText must be null per our exclusive rule
                    replyText: ar.templateId ? null : ar.content,
                    mediaId: ar.templateId ? null : ar.mediaId,
                    templateId: ar.templateId,
                    legacyId: ar.id,
                    createdAt: ar.createdAt,
                    // Cooldown uses system default
                },
            });

            console.log(`[SUCCESS] Migrated legacy Auto Reply "${ar.keyword}" -> KeywordAutomation ${kw.id}`);
            migrated++;
        } catch (err: any) {
            console.error(`[ERROR] Failed to migrate ${ar.id} ("${ar.keyword}"):`, err.message);
        }
    }

    console.log('--- Migration Completed ---');
    console.log(`Total Migrated: ${migrated}`);
    console.log(`Already Migrated (Skipped): ${skipped}`);
}

migrateAutoReplies()
    .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
