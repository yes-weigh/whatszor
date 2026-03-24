import { Queue, QueueOptions } from 'bullmq';
import { env } from '../env';
import { logger } from '../core/logger';


const log = logger.child({ module: 'queues' });

/**
 * Named queues in the Whatsvue platform.
 * Each queue has its own concurrency and retry configuration.
 */
export enum QueueName {
    DEFAULT = 'default',
    WHATSAPP = 'whatsapp',    // Outbound WA message delivery
    CAMPAIGN = 'campaign',    // Broadcast job chunks
    AUTOMATION = 'automation', // Automation rule execution
    AI = 'ai',               // AI assistant processing
    NOTIFICATION = 'notification', // Internal/email notifications
    KNOWLEDGE_OUTREACH = 'knowledge_outreach', // Chatbot product info requests
    KNOWLEDGE_INGESTION = 'knowledge_ingestion', // Chatbot product info inbound parsing
}

function getQueueOptions(): QueueOptions {
    const redisUrl = new URL(env.REDIS_URL);
    return {
        connection: {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || '6379', 10),
            password: redisUrl.password || undefined,
            maxRetriesPerRequest: null, // Required for BullMQ
            // Survive transient Redis TCP resets (ECONNRESET/ETIMEDOUT)
            retryStrategy: (times: number) => Math.min(times * 200, 30_000),
            reconnectOnError: (err: Error) => {
                const codes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
                return codes.some(c => err.message.includes(c) || (err as any).code === c);
            },
        },
        defaultJobOptions: {
            attempts: 5,
            backoff: {
                type: 'exponential',
                delay: 2000, // 2s, 4s, 8s, 16s...
            },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
        },
    };
}

// Singleton queue instances
const queues: Map<QueueName, Queue> = new Map();

export function getAllQueues() {
    return queues;
}

/**
 * Returns the singleton Queue instance for the given name.
 * Creates it on first access.
 */
export function getQueue(name: QueueName): Queue {
    if (!queues.has(name)) {
        const q = new Queue(name, getQueueOptions());
        queues.set(name, q);
        log.debug({ queue: name }, 'Queue initialized');
    }
    return queues.get(name)!;
}

/**
 * Initialize all queues. Call once during server startup.
 */
export function initQueues(): void {
    Object.values(QueueName).forEach((name) => getQueue(name as QueueName));
    log.info({ queues: Object.values(QueueName) }, 'All queues initialized');
}

/**
 * Graceful queue shutdown.
 */
export async function closeQueues(): Promise<void> {
    await Promise.all([...queues.values()].map((q) => q.close()));
    log.info('All queues closed');
}
