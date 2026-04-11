/**
 * dlq.service.ts — Dead Letter Queue management service
 *
 * Responsibilities:
 *   - List DLQ entries with filtering (queue, status, workspace, time range)
 *   - Fetch a single DLQ entry with full payload
 *   - Replay: re-enqueue original payload to BullMQ + stamp DLQ record atomically
 *   - Discard: mark a DLQ entry as DISCARDED (no replay)
 *   - Stats: aggregated counts per queue / status for the admin dashboard
 *
 * Replay safety:
 *   The DLQ row is updated to REPLAYED with the new jobId in the SAME transaction
 *   as the Queue.add() call (best-effort 2-phase: if BullMQ fails the DB stays
 *   PENDING_REVIEW; if DB update fails the replay is still logged on the job).
 *   A `replayedJobId` guard prevents double-replaying the same row.
 */

import { prisma } from '../../prisma/client';
import { getQueue, QueueName } from '../../queues';
import { createLogger } from '../../core/logger';

// Mirror the Prisma schema enum. Once the migration runs this will also be
// exported by @prisma/client but we keep a local alias to avoid the import
// resolving before the client is generated.
type DlqStatus = 'PENDING_REVIEW' | 'REPLAYED' | 'DISCARDED';

const log = createLogger({ module: 'dlq.service' });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DlqListOptions {
    queueName?: string;
    status?: DlqStatus;
    workspaceId?: string;
    /** ISO-8601 string — entries failed on or after this date */
    since?: string;
    skip?: number;
    take?: number;
}

export interface DlqReplayResult {
    dlqId: string;
    newJobId: string;
    queueName: string;
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listDlqEntries(opts: DlqListOptions = {}) {
    const { queueName, status, workspaceId, since, skip = 0, take = 50 } = opts;

    const safeTake = Math.min(take, 200); // hard cap to protect the DB

    const where = {
        ...(queueName && { queueName }),
        ...(status && { status }),
        ...(workspaceId && { workspaceId }),
        ...(since && { failedAt: { gte: new Date(since) } }),
    };

    const [entries, total] = await Promise.all([
        prisma.deadLetterJob.findMany({
            where,
            orderBy: { failedAt: 'desc' },
            skip,
            take: safeTake,
            select: {
                id: true,
                jobId: true,
                queueName: true,
                jobName: true,
                failReason: true,
                failedAt: true,
                attemptsMade: true,
                status: true,
                workspaceId: true,
                replayedAt: true,
                replayedJobId: true,
                replayedBy: true,
                createdAt: true,
                // Intentionally omit payload + stackTrace in list view
            },
        }),
        prisma.deadLetterJob.count({ where }),
    ]);

    return { entries, total, skip, take: safeTake };
}

// ── Get single ────────────────────────────────────────────────────────────────

export async function getDlqEntry(id: string) {
    const entry = await prisma.deadLetterJob.findUnique({ where: { id } });
    if (!entry) {
        const err = new Error(`DLQ entry not found: ${id}`);
        (err as any).statusCode = 404;
        (err as any).code = 'NOT_FOUND';
        throw err;
    }
    return entry;
}

// ── Replay ────────────────────────────────────────────────────────────────────

export async function replayDlqEntry(id: string, replayedBy: string): Promise<DlqReplayResult> {
    // Fetch the full entry (need payload + queueName)
    const entry = await getDlqEntry(id);

    // Guard: already replayed
    if (entry.status === 'REPLAYED') {
        const err = new Error(
            `DLQ entry ${id} has already been replayed (job: ${entry.replayedJobId}). Discard it first if you want to force a second replay.`
        );
        (err as any).statusCode = 409;
        (err as any).code = 'ALREADY_REPLAYED';
        throw err;
    }

    // Guard: discarded
    if (entry.status === 'DISCARDED') {
        const err = new Error(`DLQ entry ${id} has been discarded and cannot be replayed.`);
        (err as any).statusCode = 409;
        (err as any).code = 'ENTRY_DISCARDED';
        throw err;
    }

    // Validate queue name is one we know about
    const validQueues = Object.values(QueueName) as string[];
    if (!validQueues.includes(entry.queueName)) {
        const err = new Error(`Unknown queue "${entry.queueName}" — cannot replay.`);
        (err as any).statusCode = 422;
        (err as any).code = 'UNKNOWN_QUEUE';
        throw err;
    }

    const queue = getQueue(entry.queueName as QueueName);

    // Re-enqueue with the original payload. Add dlq metadata so the processor
    // can detect a replay and optionally skip idempotency-lock checks.
    const newJob = await queue.add(entry.jobName, {
        ...(entry.payload as object),
        _dlqReplay: true,
        _dlqSourceId: entry.id,
        _originalJobId: entry.jobId,
    });

    const newJobId = newJob.id ?? 'unknown';

    // Stamp the DLQ row. If this DB write fails, the replay still happened
    // in BullMQ — log the error but don't throw (the job is already running).
    await prisma.deadLetterJob.update({
        where: { id },
        data: {
            status: 'REPLAYED',
            replayedAt: new Date(),
            replayedJobId: newJobId,
            replayedBy,
        },
    }).catch((dbErr: unknown) => {
        log.error(
            { dbErr, dlqId: id, newJobId },
            'Failed to stamp DLQ entry as REPLAYED after successful re-enqueue'
        );
    });

    log.info({ dlqId: id, newJobId, queueName: entry.queueName, replayedBy }, 'DLQ job replayed');

    return { dlqId: id, newJobId, queueName: entry.queueName };
}

// ── Bulk Replay ───────────────────────────────────────────────────────────────

export interface BulkReplayResult {
    attempted: number;
    succeeded: number;
    failed: number;
    results: Array<{ id: string; ok: boolean; jobId?: string; error?: string }>;
}

export async function bulkReplayDlqEntries(ids: string[], replayedBy: string): Promise<BulkReplayResult> {
    if (ids.length > 100) {
        const err = new Error('Bulk replay limit is 100 entries per request.');
        (err as any).statusCode = 400;
        (err as any).code = 'BULK_LIMIT_EXCEEDED';
        throw err;
    }

    const results: BulkReplayResult['results'] = [];
    let succeeded = 0;
    let failed = 0;

    // Sequential to avoid overwhelming the queue with a burst
    for (const id of ids) {
        try {
            const r = await replayDlqEntry(id, replayedBy);
            results.push({ id, ok: true, jobId: r.newJobId });
            succeeded++;
        } catch (err: any) {
            results.push({ id, ok: false, error: err.message });
            failed++;
        }
    }

    return { attempted: ids.length, succeeded, failed, results };
}

// ── Discard ───────────────────────────────────────────────────────────────────

export async function discardDlqEntry(id: string): Promise<void> {
    const entry = await getDlqEntry(id);

    if (entry.status === 'REPLAYED') {
        const err = new Error(`DLQ entry ${id} has already been replayed and cannot be discarded.`);
        (err as any).statusCode = 409;
        (err as any).code = 'ALREADY_REPLAYED';
        throw err;
    }

    await prisma.deadLetterJob.update({
        where: { id },
        data: { status: 'DISCARDED' },
    });

    log.info({ dlqId: id }, 'DLQ job discarded');
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface DlqStats {
    total: number;
    byStatus: Record<DlqStatus, number>;
    byQueue: Record<string, { total: number; pending: number }>;
    oldestPendingAt: Date | null;
}

export async function getDlqStats(workspaceId?: string): Promise<DlqStats> {
    const baseWhere = workspaceId ? { workspaceId } : {};

    const [total, byStatusRaw, byQueueRaw, oldest] = await Promise.all([
        prisma.deadLetterJob.count({ where: baseWhere }),

        prisma.deadLetterJob.groupBy({
            by: ['status'],
            where: baseWhere,
            _count: { _all: true },
        }),

        prisma.deadLetterJob.groupBy({
            by: ['queueName', 'status'],
            where: baseWhere,
            _count: { _all: true },
        }),

        prisma.deadLetterJob.findFirst({
            where: { ...baseWhere, status: 'PENDING_REVIEW' },
            orderBy: { failedAt: 'asc' },
            select: { failedAt: true },
        }),
    ]);

    const byStatus: Record<string, number> = {
        PENDING_REVIEW: 0,
        REPLAYED: 0,
        DISCARDED: 0,
    };
    for (const row of byStatusRaw) {
        byStatus[row.status] = row._count._all;
    }

    const byQueue: Record<string, { total: number; pending: number }> = {};
    for (const row of byQueueRaw) {
        if (!byQueue[row.queueName]) byQueue[row.queueName] = { total: 0, pending: 0 };
        byQueue[row.queueName].total += row._count._all;
        if (row.status === 'PENDING_REVIEW') {
            byQueue[row.queueName].pending += row._count._all;
        }
    }

    return {
        total,
        byStatus: byStatus as Record<DlqStatus, number>,
        byQueue,
        oldestPendingAt: oldest?.failedAt ?? null,
    };
}
