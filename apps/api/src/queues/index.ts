import { Queue, QueueOptions } from 'bullmq';
import { env } from '../env';
import { logger } from '../core/logger';
import { getTraceId } from '../core/context';

const log = logger.child({ module: 'queues' });

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
}

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

const queues: Map<QueueName, Queue> = new Map();

export function getQueue(name: QueueName): Queue {
    if (!queues.has(name)) {
        const q = new Queue(name, getQueueOptions());
        const originalAdd = q.add.bind(q);
        
        // Proxy add to enforce traceId
        q.add = (async (jobName: string, data: any, opts?: any) => {
            const traceId = data.traceId || getTraceId();
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
