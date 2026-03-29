import { Worker } from 'bullmq';
import { env } from '../env';
import { logger } from '../core/logger';
import { QueueName } from './index';
import { requestContext } from '../core/context';
import { getRedisClient } from '../core/redis';

// ── Worker processors ─────────────────────────────────────────────────────────
import { processInboundMessage } from '../core/workers/inbound-message.worker';
import { processHistorySync } from '../core/workers/history-sync.worker';
import { processContactsSync } from '../core/workers/contacts-sync.worker';
import { processOutboundMessage } from '../core/workers/outbound-message.worker';
import { processSystemEvent } from '../core/workers/system-events.worker';
import { processAutomationJob } from '../modules/automation/automation-worker';
import { processCampaignJob } from '../modules/campaign/campaign-worker';
import { processAiJob } from '../modules/ai/ai-worker';
import { processKnowledgeOutreachJob } from '../modules/knowledge/knowledge.worker';
import { processIncomingKnowledgeJob } from '../modules/knowledge/knowledge.ingestion';

const log = logger.child({ module: 'workers' });

function buildConnection() {
    const redisUrl = new URL(env.REDIS_URL);
    return {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
        password: redisUrl.password || undefined,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => Math.min(times * 200, 30_000),
    };
}

/**
 * Wraps a processor with trace context management.
 * Extracts traceId from job data and runs the processor inside a requestContext.
 */
function wrapProcessor(processor: any) {
    return async (job: any) => {
        const traceId = job.data?.traceId || `tr-job-${job.id}`;
        return requestContext.run({ traceId }, async () => {
            // Set job-specific trace on the logger for this execution
            const jobLog = log.child({ traceId, jobId: job.id, queue: job.opts.queueName });
            try {
                return await processor(job);
            } catch (err) {
                jobLog.error({ err }, 'Processor exception');
                throw err;
            }
        });
    };
}

function createWorker(queueName: QueueName, processor: any, concurrency: number): Worker {
    const worker = new Worker(queueName, wrapProcessor(processor), {
        connection: buildConnection(),
        concurrency,
    });

    worker.on('active', (job) => {
        log.info({ queue: queueName, jobId: job.id, name: job.name, traceId: job.data?.traceId }, 'Job started');
    });
    worker.on('completed', (job) => {
        log.info({ queue: queueName, jobId: job.id, duration: (job.finishedOn || 0) - (job.processedOn || 0) }, 'Job completed');
    });
    worker.on('failed', (job, err) => {
        log.error({ queue: queueName, jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message }, 'Job failed');
    });

    log.info({ queue: queueName, concurrency }, 'Worker registered');
    return worker;
}

let workers: Worker[] = [];
let heartbeatTimer: NodeJS.Timeout | null = null;

/** Starts the heartbeat loop to signify worker liveness. */
async function startHeartbeat() {
    const redis = getRedisClient();
    const HEARTBEAT_KEY = 'worker:heartbeat';
    const INTERVAL = 5000;
    const TTL = 10;

    const tick = async () => {
        try {
            await redis.set(HEARTBEAT_KEY, Date.now().toString(), 'EX', TTL);
        } catch (err) {
            log.warn({ err }, 'Worker heartbeat failed');
        }
    };

    await tick();
    heartbeatTimer = setInterval(tick, INTERVAL);
    log.info({ interval: INTERVAL, ttl: TTL }, 'Worker heartbeat started');
}

export function startWorkers(): void {
    workers = [
        createWorker(QueueName.INBOUND_MESSAGES, processInboundMessage, 5),
        createWorker(QueueName.OUTBOUND_MESSAGES, processOutboundMessage, 5),
        createWorker(QueueName.HISTORY_SYNC, processHistorySync, 1),
        createWorker(QueueName.CONTACTS_SYNC, processContactsSync, 2),
        createWorker(QueueName.SYSTEM_EVENTS, processSystemEvent, 3),
        createWorker(QueueName.CAMPAIGN, processCampaignJob, 2),
        createWorker(QueueName.AUTOMATION, processAutomationJob, 5),
        createWorker(QueueName.AI, processAiJob, 3),
        createWorker(QueueName.KNOWLEDGE_OUTREACH, processKnowledgeOutreachJob, 2),
        createWorker(QueueName.KNOWLEDGE_INGESTION, processIncomingKnowledgeJob, 2),
    ];

    startHeartbeat();

    log.info({ count: workers.length, queues: Object.values(QueueName) }, 'All workers started');
}

export async function stopWorkers(): Promise<void> {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await Promise.all(workers.map(w => w.close()));
    log.info('All workers stopped');
}

export { buildConnection };
