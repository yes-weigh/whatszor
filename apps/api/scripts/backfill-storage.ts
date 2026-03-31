/**
 * scripts/backfill-storage.ts
 *
 * One-time script to compute storageUsedBytes for all workspaces
 * from existing Media records and write the totals to Workspace.storageUsedBytes.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json scripts/backfill-storage.ts
 *
 * This is safe to re-run — it overwrites the current storageUsedBytes value
 * with a fresh aggregate from the Media table. Only run this when the system
 * is quiesced (no uploads in progress) to avoid race conditions.
 */

import '../src/env'; // Ensure env is parsed first
import { prisma } from '../src/prisma/client';

async function backfillStorage() {
    console.log('🔄 Starting storage backfill...\n');

    // Aggregate total bytes per workspace from all non-deleted Media records
    const agg = await prisma.media.groupBy({
        by: ['workspaceId'],
        _sum: { size: true },
    });

    if (agg.length === 0) {
        console.log('ℹ️  No media records found. Nothing to backfill.');
        return;
    }

    console.log(`📊 Found ${agg.length} workspace(s) with media. Updating...`);

    let updated = 0;
    let skipped = 0;

    for (const row of agg) {
        const totalBytes = BigInt(row._sum.size ?? 0);

        try {
            await prisma.workspace.update({
                where: { id: row.workspaceId },
                data: { storageUsedBytes: totalBytes },
            });
            console.log(`  ✅ workspace ${row.workspaceId}: ${(Number(totalBytes) / (1024 * 1024)).toFixed(2)} MB`);
            updated++;
        } catch (err: any) {
            if (err.code === 'P2025') {
                // Workspace was deleted — orphaned media rows
                console.warn(`  ⚠️  workspace ${row.workspaceId} not found (orphaned media). Skipping.`);
                skipped++;
            } else {
                throw err;
            }
        }
    }

    // Zero out workspaces that have no media records at all
    const workspacesWithMedia = new Set(agg.map((r) => r.workspaceId));
    const allWorkspaces = await prisma.workspace.findMany({ select: { id: true } });
    const noMediaWorkspaces = allWorkspaces.filter((ws) => !workspacesWithMedia.has(ws.id));

    if (noMediaWorkspaces.length > 0) {
        await prisma.workspace.updateMany({
            where: { id: { in: noMediaWorkspaces.map((ws) => ws.id) } },
            data: { storageUsedBytes: 0n },
        });
        console.log(`\n  ✅ Zeroed storageUsedBytes for ${noMediaWorkspaces.length} workspace(s) with no media.`);
    }

    console.log(`\n✅ Backfill complete! Updated: ${updated}, Skipped (orphaned): ${skipped}`);
}

backfillStorage()
    .catch((err) => {
        console.error('❌ Backfill failed:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
