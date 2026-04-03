import { Queue, QueueOptions } from 'bullmq';
import { env } from '../env';
import { createLogger } from '../core/logger';
import { getTraceId } from '../core/context';

const log = createLogger({ module: 'queues' });

/**
 * UNIFIED queue registry for the Whatszor platform.
 */
export enum QueueName {
    INBOUND_MESSAGES = 'inbound-messages',
    OUTBOUND_MESSAGES = 'outbound-messages',
    HISTORY_SYNC = 'history-sync',
    CONTACTS_SYNC = 'contacts-sync',
    SYSTEM_EVENTS = 'system-events',
    CAMPAIGN = 'campaign',
    AUTOMATION = 'automation',
    AI = 'ai',
    KNOWLEDGE_OUTREACH = 'knowledge_outreach',
    KNOWLEDGE_INGESTION = 'knowledge_ingestion',
    LEAD_GENERATION = 'lead-generation',
}

// ── Per-queue job option tuning ─────────────────────────────────────────────
// Outbound messages must be reliable but should surface failures quickly.
// AI / ingestion can be slow; give generous backoff.
const QUEUE_JOB_OPTIONS: Partial<Record<QueueName, QueueOptions['defaultJobOptions']>> = {
    [QueueName.OUTBOUND_MESSAGES]: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 1_000 }, // keep failures long for audit
    },
    [QueueName.INBOUND_MESSAGES]: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 1_000 },
    },
    [QueueName.CAMPAIGN]: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
    },
    [QueueName.AI]: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 10_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
    },
    [QueueName.KNOWLEDGE_INGESTION]: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
    },
    [QueueName.LEAD_GENERATION]: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
    },
};

const DEFAULT_JOB_OPTIONS: QueueOptions['defaultJobOptions'] = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
};
// ───────────────────────────────────────────────────────────────────────────

function buildConnectionOptions() {
    const redisUrl = new URL(env.REDIS_URL);
    return {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
        password: redisUrl.password || undefined,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => Math.min(times * 200, 30_000),
    };
}

function getQueueOptions(name: QueueName): QueueOptions {
    return {
        connection: buildConnectionOptions(),
        defaultJobOptions: QUEUE_JOB_OPTIONS[name] ?? DEFAULT_JOB_OPTIONS,
    };
}

const queues: Map<QueueName, Queue> = new Map();

export function getQueue(name: QueueName): Queue {
    if (!queues.has(name)) {
        const q = new Queue(name, getQueueOptions(name));
        const originalAdd = q.add.bind(q);

        // Proxy add to enforce traceId propagation across all queues
        q.add = (async (jobName: string, data: any, opts?: any) => {
            const traceId = data?.traceId || getTraceId();
            if (!traceId) {
                log.warn({ queue: name, jobName }, 'Job enqueued without traceId — source tracing will be incomplete');
            }
            return originalAdd(jobName, { ...data, traceId }, opts);
        }) as any;

        queues.set(name, q);
        log.debug({ queue: name }, 'Queue initialized with trace propagation');
    }
    return queues.get(name)!;
}

export function getAllQueues() {
    return queues;
}

export function initQueues(): void {
    Object.values(QueueName).forEach(name => getQueue(name as QueueName));
    log.info({ queues: Object.values(QueueName) }, 'All queues initialized');
}

export async function closeQueues(): Promise<void> {
    await Promise.all([...queues.values()].map(q => q.close()));
    log.info('All queues closed');
}

export { buildConnectionOptions };
