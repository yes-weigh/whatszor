import { Worker, Job } from 'bullmq';
import { env } from '../env';
import { logger } from '../core/logger';
import { QueueName } from './index';

const log = logger.child({ module: 'workers' });

/**
 * Worker stubs — these will be replaced with real processors in later phases.
 * Each worker is defined here for infrastructure wiring purposes only.
 */

function createWorker(queueName: QueueName, processor: any, concurrency: number): Worker {
    const redisUrl = new URL(env.REDIS_URL);
    const worker = new Worker(queueName, processor, {
        connection: {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || '6379', 10),
            password: redisUrl.password || undefined,
            maxRetriesPerRequest: null, // Required for BullMQ
            // Exponential backoff up to 30s — survives transient ECONNRESET
            retryStrategy: (times: number) => Math.min(times * 200, 30_000),
            reconnectOnError: (err: Error) => {
                const reconnectCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
                return reconnectCodes.some(code => err.message.includes(code) || (err as any).code === code);
            },
            enableOfflineQueue: false, // Fail fast instead of queueing commands when disconnected
        },
        concurrency,
    });

    worker.on('active', (job) => {
        log.info({ queue: queueName, jobId: job.id, name: job.name }, 'Job started execution');
    });

    worker.on('completed', (job) => {
        log.info({ queue: queueName, jobId: job.id, duration: job.finishedOn! - job.processedOn! }, 'Job completed successfully');
    });

    worker.on('failed', (job, err) => {
        log.error({ queue: queueName, jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message, stack: err.stack }, 'Job failed execution');
    });

    worker.on('error', (err) => {
        log.error({ queue: queueName, err: err.message, stack: err.stack }, 'Worker instance error');
    });

    log.info({ queue: queueName, concurrency }, 'Worker started');
    return worker;
}

function createWorkerStub(queueName: QueueName, concurrency: number): Worker {
    return createWorker(queueName, async (job: Job) => {
        log.debug(
            { queue: queueName, jobId: job.id, jobName: job.name },
            `[STUB] Processing job — real handler to be implemented in later phases`,
        );
    }, concurrency);
}

let workers: Worker[] = [];

import { processAutomationJob } from '../modules/automation/automation-worker';
import { processCampaignJob } from '../modules/campaign/campaign-worker';
import { processAiJob } from '../modules/ai/ai-worker';

export function startWorkers(): void {
    workers = [
        createWorkerStub(QueueName.DEFAULT, 5),
        createWorkerStub(QueueName.WHATSAPP, 10),
        createWorker(QueueName.CAMPAIGN, processCampaignJob, 2),
        createWorker(QueueName.AUTOMATION, processAutomationJob, 5),
        createWorker(QueueName.AI, processAiJob, 3),
        createWorkerStub(QueueName.NOTIFICATION, 5),
    ];
}

export async function stopWorkers(): Promise<void> {
    await Promise.all(workers.map((w) => w.close()));
    log.info('All workers stopped');
}
