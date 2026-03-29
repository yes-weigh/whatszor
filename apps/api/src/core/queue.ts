/**
 * core/queue.ts — WhatsApp Event Bridge
 *
 * This file wires Baileys WA events into BullMQ queues.
 * It contains ONLY bridge logic — no Worker instantiations.
 *
 * Workers live in:
 *   core/workers/inbound-message.worker.ts
 *   core/workers/history-sync.worker.ts
 *   core/workers/contacts-sync.worker.ts
 *   core/workers/outbound-message.worker.ts
 *   core/workers/system-events.worker.ts
 *   modules/automation/automation-worker.ts
 *   modules/campaign/* (existing)
 *   modules/knowledge/* (existing)
 *
 * All workers are started from queues/worker.ts startWorkers().
 */
import { logger } from './logger';
import { prisma } from '../prisma/client';
import { waManager } from '../modules/whatsapp/whatsapp.service';
import { emit as realtimeEmit } from './realtime';
import { getQueue, QueueName } from '../queues';

const log = logger.child({ module: 'queue-bridge' });

/**
 * Registers Baileys event listeners and routes each event into
 * the appropriate BullMQ queue. Call once during server startup.
 */
export function initializeWorkers(): void {
    log.info('Registering WhatsApp → Queue event bridges...');

    // ── Inbound messages ──────────────────────────────────────────────────────
    waManager.on('messages', async (data) => {
        try {
            const { workspaceId, sessionId, messages } = data;
            for (const msg of messages) {
                const messageId = msg.key.id;
                const remoteJid = msg.key.remoteJid;
                if (!messageId || !remoteJid) continue;

                const jobId = `wa:${workspaceId}:${remoteJid}:${messageId}`;
                await getQueue(QueueName.INBOUND_MESSAGES).add(
                    jobId,
                    { workspaceId, sessionId, messages: [msg] }, // Process one by one for strict idempotency
                    { jobId }
                );
            }
        } catch (error) {
            log.error({ error, data }, 'Failed to enqueue inbound messages');
        }
    });

    // ── History sync ──────────────────────────────────────────────────────────
    waManager.on('history', async (data) => {
        try {
            await getQueue(QueueName.HISTORY_SYNC).add(
                `history-${data.workspaceId}-${Date.now()}`,
                data,
                { removeOnComplete: true, removeOnFail: 50 },
            );
        } catch (error) {
            log.error({ error }, 'Failed to enqueue history sync');
        }
    });

    // ── Contacts sync (90s delay so history-sync creates conversations first) ─
    waManager.on('contacts', async (data) => {
        try {
            await getQueue(QueueName.CONTACTS_SYNC).add(
                `contacts-${data.workspaceId}-${Date.now()}`,
                data,
                { removeOnComplete: true, delay: 90_000 },
            );
        } catch (error) {
            log.error({ error }, 'Failed to enqueue contacts sync');
        }
    });

    // ── Message receipts (lightweight, handled inline — no queue needed) ──────
    waManager.on('receipt', async ({ workspaceId, updates }) => {
        try {
            for (const update of updates) {
                const { key, receipt } = update;
                if (!key.fromMe || !key.id) continue;

                const status = receipt.readTimestamp ? 'READ'
                    : receipt.playedTimestamp ? 'PLAYED'
                    : 'DELIVERED';

                const msg = await (prisma.message as any).findFirst({
                    where: { remoteId: key.id, conversation: { workspaceId } },
                    select: { id: true, status: true, conversationId: true },
                });
                if (!msg) continue;

                const rank: Record<string, number> = { SENT: 0, DELIVERED: 1, PLAYED: 2, READ: 3 };
                if ((rank[status] ?? 0) <= (rank[msg.status] ?? 0)) continue;

                await (prisma.message as any).update({ where: { id: msg.id }, data: { status } });

                const updatedMembers = await (prisma.campaignMember as any).findMany({
                    where: { messageId: msg.id },
                    select: { id: true, campaignId: true, status: true },
                });

                if (updatedMembers.length > 0) {
                    await (prisma.campaignMember as any).updateMany({ where: { messageId: msg.id }, data: { status } });

                    for (const member of updatedMembers) {
                        if (member.status === status) continue;
                        const campaign = await prisma.campaign.findUnique({ where: { id: member.campaignId } });
                        if (campaign) {
                            const stats = (campaign.stats as Record<string, number>) || {};
                            stats.delivered = stats.delivered || 0;
                            stats.read = stats.read || 0;
                            if (status === 'DELIVERED' && member.status !== 'DELIVERED' && member.status !== 'READ' && member.status !== 'PLAYED') {
                                stats.delivered += 1;
                            } else if ((status === 'READ' || status === 'PLAYED') && member.status !== 'READ' && member.status !== 'PLAYED') {
                                stats.read += 1;
                            }
                            await prisma.campaign.update({ where: { id: campaign.id }, data: { stats: stats as any } });
                        }
                    }
                }

                realtimeEmit(workspaceId, 'message.status', {
                    messageId: msg.id,
                    conversationId: msg.conversationId,
                    status,
                });
            }
        } catch (error) {
            log.error({ error }, 'Failed to process message receipts');
        }
    });

    // ── Contact name backfill after history sync settles ─────────────────────
    waManager.on('refresh-contacts', async ({ sessionId, workspaceId, sock }) => {
        try {
            const sockContacts: Record<string, any> = (sock as any).contacts ?? {};
            const emptyConvs = await (prisma.conversation as any).findMany({
                where: { workspaceId, sessionId, waContactName: null, provider: 'WHATSAPP' },
                select: { id: true, providerId: true },
            });
            log.info({ sessionId, count: emptyConvs.length }, 'Backfilling missing contact names from socket store');

            let fixed = 0;
            for (const conv of emptyConvs) {
                const jid: string = conv.providerId;
                if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) continue;
                const contact = sockContacts[jid];
                const name = contact?.notify || contact?.name;
                if (!name) continue;
                await (prisma.conversation as any).update({ where: { id: conv.id }, data: { waContactName: name } });
                fixed++;
            }
            log.info({ sessionId, fixed, total: emptyConvs.length }, 'Contact name backfill complete');
        } catch (err) {
            log.error({ err, sessionId }, 'Failed to refresh contacts from socket');
        }
    });

    log.info('WhatsApp → Queue bridges registered');
}

/**
 * Re-exported for backward compatibility with any external imports.
 * These are now wrappers around getQueue() — identical Redis connection.
 *
 * @deprecated Use getQueue(QueueName.X) directly.
 */
export const outboundMessagesQueue = {
    add: (name: string, data: any, opts?: any) => getQueue(QueueName.OUTBOUND_MESSAGES).add(name, data, opts),
};

export const aiQueue = {
    add: (name: string, data: any, opts?: any) => getQueue(QueueName.AI).add(name, data, opts),
};
