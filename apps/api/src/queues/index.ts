import { Queue, QueueOptions } from 'bullmq';
import { env } from '../env';
import { logger } from '../core/logger';

const log = logger.child({ module: 'queues' });

/**
 * UNIFIED queue registry for the Whatszor platform.
 *
 * ALL queue names live here. There is exactly ONE Queue instance per name,
 * managed via the getQueue() singleton factory below.
 *
 * Producers:  call getQueue(QueueName.X).add(...)
 * Consumers:  Workers started via queues/worker.ts startWorkers()
 */
export enum QueueName {
    // ── WhatsApp inbound pipeline ─────────────────────────────
    INBOUND_MESSAGES = 'inbound-messages',   // Raw Baileys messages.upsert → inbound-message.worker
    OUTBOUND_MESSAGES = 'outbound-messages', // API-enqueued outbound sends → outbound-message.worker
    HISTORY_SYNC = 'history-sync',           // Baileys messaging-history.set → history-sync.worker
    CONTACTS_SYNC = 'contacts-sync',         // Baileys contacts.upsert → contacts-sync.worker
    SYSTEM_EVENTS = 'system-events',         // Internal event bus → system-events.worker (triggers automations)

    // ── Feature workers ──────────────────────────────────────
    CAMPAIGN = 'campaign',                   // Broadcast job chunks
    AUTOMATION = 'automation',               // Automation rule execution steps
    AI = 'ai',                               // AI suggested reply generation
    KNOWLEDGE_OUTREACH = 'knowledge_outreach', // Chatbot product info requests
    KNOWLEDGE_INGESTION = 'knowledge_ingestion', // Inbound KB message parsing
}

function buildConnectionOptions() {
    const redisUrl = new URL(env.REDIS_URL);
    return {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
        password: redisUrl.password || undefined,
        maxRetriesPerRequest: null, // Required for BullMQ
        retryStrategy: (times: number) => Math.min(times * 200, 30_000),
        reconnectOnError: (err: Error) => {
            const codes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
            return codes.some(c => err.message.includes(c) || (err as any).code === c);
        },
    };
}

function getQueueOptions(): QueueOptions {
    return {
        connection: buildConnectionOptions(),
        defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
        },
    };
}

// ── Singleton registry ────────────────────────────────────────────────────────
const queues: Map<QueueName, Queue> = new Map();

/**
 * Returns the singleton Queue instance for the given name.
 * Creates it lazily on first access.
 */
export function getQueue(name: QueueName): Queue {
    if (!queues.has(name)) {
        const q = new Queue(name, getQueueOptions());
        queues.set(name, q);
        log.debug({ queue: name }, 'Queue initialized');
    }
    return queues.get(name)!;
}

export function getAllQueues() {
    return queues;
}

/**
 * Eagerly initialize all queues. Call once during server startup
 * so queues are registered in BullMQ before any producers fire.
 */
export function initQueues(): void {
    Object.values(QueueName).forEach(name => getQueue(name as QueueName));
    log.info({ queues: Object.values(QueueName) }, 'All queues initialized');
}

/** Graceful shutdown — drains and closes all queue connections. */
export async function closeQueues(): Promise<void> {
    await Promise.all([...queues.values()].map(q => q.close()));
    log.info('All queues closed');
}

/** Exported for use by producers in other modules. */
export { buildConnectionOptions };
