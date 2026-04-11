import { prisma } from '../prisma/client';
import { createLogger } from './logger';
import { getTraceId } from './context';

const log = createLogger({ module: 'event-logger' });

export type EventType =
    | 'message_received'
    | 'message_sent'
    | 'message_delivered'
    | 'message_read'
    | 'contact_created'
    | 'contact_updated'
    | 'campaign_sent'
    | 'campaign_triggered'
    | 'campaign_replied'
    | 'automation_triggered'
    | 'node_executed'
    | 'node_failed'
    | 'webhook_received'
    | 'contacts_bulk_deleted'
    // ── Knowledge Bot Events ───────────────────────────
    | 'knowledge_question_asked'
    | 'knowledge_response_received'
    | 'knowledge_update_applied'
    | 'knowledge_response_orphaned'
    | 'knowledge_update_failed'
    // ── Admin & Audit Events ──────────────────────────
    | 'admin_impersonation'
    | 'workspace_suspended'
    | 'workspace_activated'
    | 'member_role_changed'
    | 'session_reassigned'
    | 'session_unassigned'
    | 'qr_relay_triggered'
    // ── Lead Generation Events ────────────────────────
    | 'lead_list_created'
    | 'lead_list_ready'
    | 'leads_converted'
    | 'system_error';

// ── Batch buffer ─────────────────────────────────────────────────────────────
// Events are accumulated here and flushed as a single createMany() call.
// This reduces DB writes from O(events) to O(1) per flush interval.

const BATCH_SIZE = 50;       // flush when buffer hits this size
const FLUSH_INTERVAL_MS = 2_000; // flush every 2s regardless of buffer size

interface EventRecord {
    id: string;
    workspaceId: string;
    eventType: string;
    sourceModule: string;
    payloadMetadata: any;
    traceId: string | null;
}

let buffer: EventRecord[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let isFlushing = false;
let isShuttingDown = false;

export function setEventLoggerShuttingDown() {
    isShuttingDown = true;
}

export async function flushPendingEvents(): Promise<void> {
    if (buffer.length === 0) return;
    if (isFlushing) {
        // Simple backoff if called concurrently
        await new Promise(resolve => setTimeout(resolve, 100));
        return flushPendingEvents();
    }
    
    isFlushing = true;
    const batch = buffer.splice(0, buffer.length); // take entire buffer atomically
    
    try {
        await Promise.race([
            prisma.eventLog.createMany({
                data: batch,
                skipDuplicates: true,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Flush timeout')), 5000))
        ]);
    } catch (error) {
        log.error({ error, count: batch.length }, 'Event log batch flush failed');
        // Re-enqueue at front so events are not lost (cap at 500 to avoid unbounded growth)
        if (buffer.length < 500) {
            buffer.unshift(...batch.slice(0, 500 - buffer.length));
        }
    } finally {
        isFlushing = false;
    }
}

function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
        flushTimer = null;
        await flushPendingEvents();
    }, FLUSH_INTERVAL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write a structured event to the EventLog table.
 *
 * Events are batched in-process and flushed every 2 seconds (or at 50 events)
 * via createMany() — reducing individual DB writes by ~95%.
 *
 * This function is intentionally NOT awaited at call sites — it returns void
 * and errors are handled internally. Call as fire-and-forget:
 *
 *   logEvent(workspaceId, 'message_received', 'inbound_worker', { ... });
 *
 * traceId is automatically resolved from AsyncLocalStorage request context.
 */
export function logEvent(
    workspaceId: string,
    eventType: EventType,
    sourceModule: string,
    payloadMetadata: any = {},
    traceId?: string,
): void {
    const record: EventRecord = {
        id: require('crypto').randomUUID(),
        workspaceId,
        eventType,
        sourceModule,
        payloadMetadata,
        traceId: traceId ?? getTraceId() ?? null,
    };

    if (isShuttingDown) {
        prisma.eventLog.create({ data: record }).catch(err => log.error({ err }, 'Shutdown event log failed'));
        return;
    }

    buffer.push(record);

    if (buffer.length >= BATCH_SIZE) {
        // Threshold flush — clear timer and flush immediately
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        flushPendingEvents().catch(err => log.error({ err }, 'Threshold event log flush failed'));
    } else {
        scheduleFlush();
    }
}
