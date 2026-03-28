import { Worker } from 'bullmq';
import { env } from '../env';
import { logger } from '../core/logger';
import { QueueName } from './index';

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
        reconnectOnError: (err: Error) => {
            const reconnectCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
            return reconnectCodes.some(code => err.message.includes(code) || (err as any).code === code);
        },
        enableOfflineQueue: false,
    };
}

function createWorker(queueName: QueueName, processor: any, concurrency: number): Worker {
    const worker = new Worker(queueName, processor, {
        connection: buildConnection(),
        concurrency,
    });

    worker.on('active', (job) => {
        log.info({ queue: queueName, jobId: job.id, name: job.name }, 'Job started');
    });
    worker.on('completed', (job) => {
        log.info({ queue: queueName, jobId: job.id, duration: job.finishedOn! - job.processedOn! }, 'Job completed');
    });
    worker.on('failed', (job, err) => {
        log.error({ queue: queueName, jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message }, 'Job failed');
    });
    worker.on('error', (err) => {
        log.error({ queue: queueName, err: err.message }, 'Worker error');
    });

    log.info({ queue: queueName, concurrency }, 'Worker registered');
    return worker;
}

let workers: Worker[] = [];

export function startWorkers(): void {
    workers = [
        // ── WhatsApp inbound pipeline ─────────────────────────────────────────
        createWorker(QueueName.INBOUND_MESSAGES, processInboundMessage, 5),
        createWorker(QueueName.OUTBOUND_MESSAGES, processOutboundMessage, 5),
        createWorker(QueueName.HISTORY_SYNC, processHistorySync, 1),
        createWorker(QueueName.CONTACTS_SYNC, processContactsSync, 2),
        createWorker(QueueName.SYSTEM_EVENTS, processSystemEvent, 3),
        // ── Feature workers ───────────────────────────────────────────────────
        createWorker(QueueName.CAMPAIGN, processCampaignJob, 2),
        createWorker(QueueName.AUTOMATION, processAutomationJob, 5),
        createWorker(QueueName.AI, processAiJob, 3),
        createWorker(QueueName.KNOWLEDGE_OUTREACH, processKnowledgeOutreachJob, 2),
        createWorker(QueueName.KNOWLEDGE_INGESTION, processIncomingKnowledgeJob, 2),
    ];

    log.info({ count: workers.length, queues: Object.values(QueueName) }, 'All workers started');
}

export async function stopWorkers(): Promise<void> {
    await Promise.all(workers.map(w => w.close()));
    log.info('All workers stopped');
}
