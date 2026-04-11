/**
 * core/message-buffer.ts — Batched Message Insert Buffer
 *
 * Replaces individual `prisma.message.create()` calls on the inbound hot path
 * with a shared in-process buffer that flushes as a single `createMany()`.
 *
 * At 200 sessions × 1 msg/s without batching = 200 individual INSERTs/sec.
 * With batching (1s flush):                  = 1 createMany (up to 200 rows)/sec.
 *
 * Key properties:
 *  - bufferMessage() returns a Promise<Message> — callers await the resolved record
 *  - Flush triggers on SIZE_THRESHOLD OR FLUSH_INTERVAL_MS, whichever comes first
 *  - On createMany failure: falls back to sequential individual creates (zero message loss)
 *  - On process shutdown: flushMessageBuffer() is called to drain the buffer
 *  - skipDuplicates: true prevents double-write on BullMQ retry
 *
 * Usage:
 *   const msg = await bufferMessage({ conversationId, workspaceId, ... });
 */
import { prisma } from '../prisma/client';
import { createLogger } from './logger';

const log = createLogger({ module: 'message-buffer' });

// ── Tunables ─────────────────────────────────────────────────────────────────
const SIZE_THRESHOLD = 50;       // flush when buffer reaches N records
const FLUSH_INTERVAL_MS = 1_000; // flush every N ms regardless of size

// ─────────────────────────────────────────────────────────────────────────────

type MessageCreateInput = {
    conversationId: string;
    workspaceId: string;
    direction: 'INBOUND' | 'OUTBOUND';
    type: string;
    content: string | null;
    status: string;
    remoteId?: string | null;
    mediaData?: any;
    senderPhone?: string | null;
    senderName?: string | null;
    metadata?: any;
    isGroup?: boolean;
    fromMe?: boolean;
};

interface BufferedItem {
    data: MessageCreateInput;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

let buffer: BufferedItem[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let isFlushing = false;     // mutex — only one flush runs at a time (FIX: BUG-1)
let isShuttingDown = false;

// ── Flush logic ───────────────────────────────────────────────────────────────

async function flushBuffer(): Promise<void> {
    // Mutex: only one flush runs at a time.
    // Without this, a size-threshold flush and a scheduled flush can both
    // splice the buffer simultaneously, creating two concurrent createMany
    // calls and potentially orphaning buffered promise resolve/reject callbacks.
    if (isFlushing || buffer.length === 0) return;
    isFlushing = true;

    const batch = buffer.splice(0, buffer.length);
    const data = batch.map(item => item.data);

    try {
        // Primary path: createMany in one round-trip
        // skipDuplicates prevents double-write on worker retry (remoteId unique index)
        await (prisma.message as any).createMany({
            data,
            skipDuplicates: true,
        });

        // createMany doesn't return the created records — fetch them back by remoteId
        // For messages without remoteId, fall back to sequential fetch by conversationId + content
        const resolved = await Promise.all(
            batch.map(async (item) => {
                try {
                    if (item.data.remoteId) {
                        const record = await (prisma.message as any).findFirst({
                            where: {
                                remoteId: item.data.remoteId,
                                workspaceId: item.data.workspaceId,
                            },
                        });
                        return { item, record };
                    }
                    // Fallback: find by conversationId + direction + createdAt proximity
                    const record = await (prisma.message as any).findFirst({
                        where: {
                            conversationId: item.data.conversationId,
                            direction: item.data.direction,
                            content: item.data.content,
                        },
                        orderBy: { createdAt: 'desc' },
                    });
                    return { item, record };
                } catch (fetchErr) {
                    return { item, record: null };
                }
            })
        );

        for (const { item, record } of resolved) {
            if (record) {
                item.resolve(record);
            } else {
                // Record was deduplicated (skipDuplicates) — create individually to get the record
                try {
                    const created = await (prisma.message as any).create({ data: item.data });
                    item.resolve(created);
                } catch (dupErr: any) {
                    // True duplicate — fetch the existing record
                    if (dupErr.code === 'P2002' && item.data.remoteId) {
                        const existing = await (prisma.message as any).findFirst({
                            where: { remoteId: item.data.remoteId, workspaceId: item.data.workspaceId },
                        });
                        existing ? item.resolve(existing) : item.reject(dupErr);
                    } else {
                        item.reject(dupErr);
                    }
                }
            }
        }

        log.debug({ count: batch.length }, 'Message buffer flushed via createMany');
    } catch (batchErr) {
        // ── Failure recovery: fall back to individual creates ─────────────────
        // This ensures zero message loss even if Postgres rejects the batch.
        log.warn({ err: batchErr, count: batch.length }, 'createMany failed — falling back to sequential creates');

        for (const item of batch) {
            try {
                const record = await (prisma.message as any).create({ data: item.data });
                item.resolve(record);
            } catch (individualErr: any) {
                if (individualErr.code === 'P2002' && item.data.remoteId) {
                    // Duplicate — resolve with the existing record
                    try {
                        const existing = await (prisma.message as any).findFirst({
                            where: { remoteId: item.data.remoteId, workspaceId: item.data.workspaceId },
                        });
                        existing ? item.resolve(existing) : item.reject(individualErr);
                    } catch {
                        item.reject(individualErr);
                    }
                } else {
                    item.reject(individualErr);
                }
            }
        }
    } finally {
        // Always release the mutex so the next flush can proceed
        isFlushing = false;
    }
}

function scheduleFlush(): void {
    if (flushTimer || isShuttingDown) return;
    flushTimer = setTimeout(async () => {
        flushTimer = null;
        await flushBuffer().catch(err => log.error({ err }, 'Scheduled message buffer flush error'));
    }, FLUSH_INTERVAL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buffer a message insert and return a Promise that resolves with the
 * created Message record when the batch is flushed to Postgres.
 *
 * The Promise resolves within FLUSH_INTERVAL_MS (1 second) in the worst case,
 * or immediately when SIZE_THRESHOLD (50) records are buffered.
 */
export function bufferMessage(data: MessageCreateInput): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        if (isShuttingDown) {
            // During shutdown, write immediately — no more batch flushes will run
            (prisma.message as any).create({ data }).then(resolve).catch(reject);
            return;
        }

        buffer.push({ data, resolve, reject });

        if (buffer.length >= SIZE_THRESHOLD) {
            // Size threshold hit — flush immediately
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            flushBuffer().catch(err => log.error({ err }, 'Threshold message buffer flush error'));
        } else {
            scheduleFlush();
        }
    });
}

/**
 * Force-flush the buffer. Call this during graceful shutdown to ensure
 * no buffered messages are lost when the process exits.
 */
/**
 * Drain the buffer completely. MUST be called explicitly during graceful
 * shutdown BEFORE disconnecting the database.
 *
 * FIX (BUG-10): The previous `process.on('beforeExit')` hook never fires
 * when process.exit() is called (which both index.ts and start-worker.ts do).
 * Shutdown must call this function directly in the correct phase ordering.
 */
export async function flushMessageBuffer(): Promise<void> {
    isShuttingDown = true;

    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    // Wait for any in-progress flush to finish before draining
    let waited = 0;
    while (isFlushing) {
        await new Promise(r => setTimeout(r, 50));
        waited += 50;
        if (waited > 10_000) {
            log.error('flushMessageBuffer: timed out waiting for in-progress flush');
            break;
        }
    }

    await flushBuffer();
    log.info({ remaining: buffer.length }, 'Message buffer drained on shutdown');
}
// NOTE: No process.on('beforeExit') hook here — it does not fire when
// process.exit() is called. Shutdown sequences in index.ts and start-worker.ts
// call flushMessageBuffer() explicitly before disconnecting the database.
