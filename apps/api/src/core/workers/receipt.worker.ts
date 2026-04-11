/**
 * receipt.worker.ts — Receipt Processing Worker
 *
 * Processes message-receipt.update events from the RECEIPTS queue.
 * Moved off the WhatsApp socket event emitter to prevent event loop blocking.
 *
 * Key optimizations vs the old inline handler (queue.ts):
 *  - Bulk-reads all messages in one findMany() instead of N individual findFirst()
 *  - Single $transaction for all message status updates
 *  - One updateMany() for campaign members (not N individual updates)
 *  - One campaign.update() per campaign (not one per member) — fixes confirmed N+1
 *  - Emits realtime SSE only for status upgrades (rank-based de-duplication preserved)
 */
import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { createLogger } from '../logger';
import { emit as realtimeEmit } from '../realtime';

const log = createLogger({ module: 'worker:receipts' });

const STATUS_RANK: Record<string, number> = {
    SENT: 0,
    DELIVERED: 1,
    PLAYED: 2,
    READ: 3,
};

export async function processReceiptJob(job: Job): Promise<void> {
    const { workspaceId, updates } = job.data as {
        workspaceId: string;
        updates: Array<{ key: { id?: string; fromMe?: boolean }; receipt: any }>;
    };

    if (!updates?.length) return;

    // ── Step 1: Collect outbound message remote IDs ───────────────────────────
    const outboundRemoteIds = updates
        .filter(u => u.key.fromMe && u.key.id)
        .map(u => u.key.id as string);

    if (outboundRemoteIds.length === 0) return;

    // ── Step 2: Bulk-read all relevant messages in ONE query ──────────────────
    const messages = await (prisma.message as any).findMany({
        where: {
            remoteId: { in: outboundRemoteIds },
            conversation: { workspaceId },
        },
        select: { id: true, remoteId: true, status: true, conversationId: true },
    });

    if (messages.length === 0) return;

    const msgByRemoteId = new Map<string, { id: string; status: string; conversationId: string }>(
        messages.map((m: any) => [m.remoteId, m])
    );

    // ── Step 3: Determine which statuses actually need upgrading ─────────────
    const upgrades: Array<{ id: string; status: string; conversationId: string }> = [];

    for (const update of updates) {
        const { key, receipt } = update;
        if (!key.fromMe || !key.id) continue;

        const newStatus = receipt.readTimestamp
            ? 'READ'
            : receipt.playedTimestamp
            ? 'PLAYED'
            : 'DELIVERED';

        const msg = msgByRemoteId.get(key.id);
        if (!msg) continue;

        // Only upgrade (never downgrade) status
        if ((STATUS_RANK[newStatus] ?? 0) <= (STATUS_RANK[msg.status] ?? 0)) continue;

        upgrades.push({ id: msg.id, status: newStatus, conversationId: msg.conversationId });
    }

    if (upgrades.length === 0) return;

    // ── Step 4: Bulk-update message statuses in one transaction ──────────────
    await prisma.$transaction(
        upgrades.map(({ id, status }) =>
            (prisma.message as any).update({ where: { id }, data: { status } })
        )
    );

    // ── Step 5: Emit SSE for each upgraded message ────────────────────────────
    for (const { id, status, conversationId } of upgrades) {
        realtimeEmit(workspaceId, 'message.status', {
            messageId: id,
            conversationId,
            status,
        });
    }

    // ── Step 6: Handle campaign member + stats updates ────────────────────────
    const upgradeIds = upgrades.map(u => u.id);

    const campaignMembers = await (prisma.campaignMember as any).findMany({
        where: {
            messageId: { in: upgradeIds },
        },
        select: { id: true, campaignId: true, messageId: true, status: true },
    });

    if (campaignMembers.length === 0) return;

    // Build a map from messageId → new status for fast lookup
    const statusByMsgId = new Map(upgrades.map(u => [u.id, u.status]));

    // Filter to members whose status actually needs to change
    const memberUpgrades = campaignMembers.filter((member: any) => {
        const newStatus = statusByMsgId.get(member.messageId);
        if (!newStatus) return false;
        return (STATUS_RANK[newStatus] ?? 0) > (STATUS_RANK[member.status] ?? 0);
    });

    if (memberUpgrades.length === 0) return;

    // ONE updateMany per status value (not N individual updates)
    const byStatus = new Map<string, string[]>();
    for (const member of memberUpgrades) {
        const newStatus = statusByMsgId.get(member.messageId)!;
        if (!byStatus.has(newStatus)) byStatus.set(newStatus, []);
        byStatus.get(newStatus)!.push(member.id);
    }

    await Promise.all(
        [...byStatus.entries()].map(([status, ids]) =>
            (prisma.campaignMember as any).updateMany({
                where: { id: { in: ids } },
                data: { status },
            })
        )
    );

    // ── Step 7: Aggregate campaign stats — ONE update per campaign ────────────
    // Accumulate deltas by campaign before touching the DB.
    // This replaces the old N×(campaign.findUnique + campaign.update) N+1 pattern.

    const campaignDeltas = new Map<string, { delivered: number; read: number }>();

    for (const member of memberUpgrades) {
        const newStatus = statusByMsgId.get(member.messageId)!;
        const delta = campaignDeltas.get(member.campaignId) ?? { delivered: 0, read: 0 };

        if (
            newStatus === 'DELIVERED' &&
            STATUS_RANK[member.status] < STATUS_RANK['DELIVERED']
        ) {
            delta.delivered++;
        } else if (
            (newStatus === 'READ' || newStatus === 'PLAYED') &&
            STATUS_RANK[member.status] < STATUS_RANK['READ']
        ) {
            delta.read++;
        }

        campaignDeltas.set(member.campaignId, delta);
    }

    // ONE campaign fetch + update per unique campaignId
    await Promise.all(
        [...campaignDeltas.entries()]
            .filter(([, delta]) => delta.delivered > 0 || delta.read > 0)
            .map(async ([campaignId, delta]) => {
                try {
                    const campaign = await prisma.campaign.findUnique({
                        where: { id: campaignId },
                        select: { id: true, stats: true },
                    });
                    if (!campaign) return;

                    const stats = (campaign.stats as Record<string, number>) || {};
                    if (delta.delivered > 0) {
                        stats.delivered = (stats.delivered ?? 0) + delta.delivered;
                    }
                    if (delta.read > 0) {
                        stats.read = (stats.read ?? 0) + delta.read;
                    }

                    await prisma.campaign.update({
                        where: { id: campaignId },
                        data: { stats: stats as any },
                    });
                } catch (err) {
                    log.warn({ err, campaignId }, 'Failed to update campaign stats from receipt');
                }
            })
    );

    log.info(
        {
            workspaceId,
            updatesIn: updates.length,
            upgraded: upgrades.length,
            campaignsUpdated: campaignDeltas.size,
        },
        'Receipt batch processed'
    );
}
