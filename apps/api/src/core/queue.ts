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
import { createLogger } from './logger';
import { prisma } from '../prisma/client';
import { waManager } from '../modules/whatsapp/whatsapp.service';
import { getQueue, QueueName } from '../queues';
import crypto from 'node:crypto';

const log = createLogger({ module: 'queue-bridge' });

/**
 * Registers Baileys event listeners and routes each event into
 * the appropriate BullMQ queue. Call once during server startup.
 */
export function initializeWorkers(): void {
    log.info('Registering WhatsApp → Queue event bridges...');

    // ── Inbound messages ──────────────────────────────────────────────────────
    waManager.on('messages', async (data) => {
        const { workspaceId, sessionId, messages } = data;
        for (const msg of messages) {
            try {
                const messageId = msg.key.id;
                const remoteJid = msg.key.remoteJid;
                if (!messageId || !remoteJid) continue;

                const jobId = `wa|${workspaceId}|${remoteJid}|${messageId}`;
                await getQueue(QueueName.INBOUND_MESSAGES).add(
                    jobId,
                    { workspaceId, sessionId, messages: [msg], traceId: crypto.randomUUID() }, // Process one by one for strict idempotency
                    { jobId }
                );
            } catch (err: any) {
                // BullMQ throws when a job with the same jobId already exists in an active state.
                // This is expected under at-least-once delivery — log as debug, not error.
                if (err?.message?.includes('already exists')) {
                    log.debug({ messageId: msg.key?.id }, 'Job already exists in queue — skipping duplicate');
                } else {
                    log.error({ err, messageId: msg.key?.id, workspaceId, sessionId }, 'Failed to enqueue inbound message');
                }
            }
        }
    });

    // ── History sync ──────────────────────────────────────────────────────────
    waManager.on('history', async (data) => {
        try {
            await getQueue(QueueName.HISTORY_SYNC).add(
                `history-${data.workspaceId}-${Date.now()}`,
                { ...data, traceId: crypto.randomUUID() },
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
                { ...data, traceId: crypto.randomUUID() },
                { removeOnComplete: true, delay: 90_000 },
            );
        } catch (error) {
            log.error({ error }, 'Failed to enqueue contacts sync');
        }
    });

    // ── Message receipts → RECEIPTS queue ────────────────────────────────────
    // IMPORTANT: Processing receipts inline blocked the WhatsApp socket event
    // emitter, causing delays and potential disconnects under burst campaign load.
    // All receipt processing is now handled by receipt.worker.ts via the queue.
    waManager.on('receipt', ({ workspaceId, updates }) => {
        if (!updates?.length) return;
        getQueue(QueueName.RECEIPTS).add(
            `receipt-${workspaceId}-${Date.now()}`,
            { workspaceId, updates },
        ).catch(err => log.error({ err, workspaceId }, 'Failed to enqueue receipts'));
    });

    // ── Contact name backfill after history sync settles ─────────────────────
    waManager.on('refresh-contacts', async ({ sessionId, workspaceId }) => {
        try {
            const contactsMap = waManager.getContactsStore(sessionId);
            const emptyConvs = await (prisma.conversation as any).findMany({
                where: { workspaceId, sessionId, waContactName: null, provider: 'WHATSAPP' },
                select: { id: true, providerId: true },
            });
            log.info({ sessionId, count: emptyConvs.length }, 'Backfilling missing contact names from socket store');

            let fixed = 0;
            for (const conv of emptyConvs) {
                const jid: string = conv.providerId;
                if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) continue;
                
                const entry = contactsMap.get(jid);
                const name = entry?.name;
                
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
