import { Worker, UnrecoverableError } from 'bullmq';
import { env } from '../env';
import { createLogger } from '../core/logger';
import { QueueName, getAllQueues } from './index';
import { requestContext } from '../core/context';
import { getRedisClient } from '../core/redis';
import { alertQueueBacklog } from '../core/alert';
import { FatalError } from '../core/errors';

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
import { processLeadGenerationJob } from '../modules/lead-generation/lead-generation.worker';
import { startZombieSweeper, stopZombieSweeper } from '../core/zombie-sweeper';

const log = createLogger({ module: 'workers', action: 'lifecycle' });

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
function wrapProcessor(queueName: QueueName, processor: any) {
    return async (job: any) => {
        const traceId = job.data?.traceId || `tr-job-${job.id}`;
        const jobLog = createLogger({
            module: `worker:${queueName}`,
            action: 'process',
            traceId,
            workspaceId: job.data?.workspaceId,
        });

        return requestContext.run({ traceId, workspaceId: job.data?.workspaceId }, async () => {
            jobLog.info(
                { jobId: job.id, jobName: job.name, queueName, attempt: job.attemptsMade + 1 },
                'Job processing started'
            );
            const startTime = Date.now();
            try {
                const result = await processor(job);
                const duration = Date.now() - startTime;
                jobLog.info(
                    { jobId: job.id, queueName, duration },
                    'Job processing succeeded'
                );
                return result;
            } catch (err: any) {
                const duration = Date.now() - startTime;
                const isRetrying = job.attemptsMade + 1 < (job.opts?.attempts || 1);

                if (err instanceof FatalError) {
                    jobLog.fatal(
                        { jobId: job.id, queueName, duration, err: err.message },
                        'FatalError detected — aborting retries and routing to DLQ immediately'
                    );
                    throw new UnrecoverableError(err.message); // BullMQ native abort
                }

                if (isRetrying) {
                    jobLog.warn(
                        { jobId: job.id, queueName, attempt: job.attemptsMade + 1, maxAttempts: job.opts?.attempts, duration, err: err.message },
                        'Job failed — will retry (Recoverable or Unknown Exception)'
                    );
                } else {
                    jobLog.error(
                        { jobId: job.id, queueName, attempt: job.attemptsMade + 1, maxAttempts: job.opts?.attempts, duration, err: err.message },
                        'Job processor threw terminal exception after all standard retries'
                    );
                }
                throw err;
            }
        });
    };
}

function createWorker(queueName: QueueName, processor: any, concurrency: number): Worker {
    const worker = new Worker(queueName, wrapProcessor(queueName, processor), {
        connection: buildConnection(),
        concurrency,
    });

    worker.on('failed', (job, err) => {
        if (!job) return;
        const isTerminal = job.attemptsMade >= (job.opts.attempts || 1);
        
        if (isTerminal) {
            const terminalLog = createLogger({
                module: `worker:${queueName}`,
                action: 'terminal-failure',
                traceId: job.data?.traceId,
                workspaceId: job.data?.workspaceId,
            });

            terminalLog.fatal(
                { 
                    event: 'job.failed.final',
                    jobId: job.id, 
                    queueName, 
                    attempts: job.attemptsMade, 
                    traceId: job.data?.traceId,
                    err: err.message,
                    stack: err.stack,
                    // Log a summary, not the full payload to avoid PII
                    payloadSummary: Object.keys(job.data || {}),
                },
                'Job exhausted all retries — entering DLQ state'
            );
        }
    });

    log.info({ queue: queueName, concurrency }, 'Worker registered');
    return worker;
}

let workers: Worker[] = [];
let heartbeatTimer: NodeJS.Timeout | null = null;
let backlogMonitorTimer: NodeJS.Timeout | null = null;

// Thresholds (waiting jobs) for alerting
const BACKLOG_WARN_THRESHOLD = 100;
const BACKLOG_CRIT_THRESHOLD = 1000;

/** Starts the heartbeat loop to signify worker liveness. */
async function startHeartbeat() {
    if (heartbeatTimer) return;
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

/** Polls all queues every 60s, logs metrics, and fires alerts at thresholds. */
async function startBacklogMonitor() {
    if (backlogMonitorTimer) return;
    const INTERVAL = 60_000;
    const monitorLog = createLogger({ module: 'workers', action: 'backlog-monitor' });

    const tick = async () => {
        const queues = getAllQueues();
        for (const [name, queue] of queues.entries()) {
            try {
                const counts = await queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
                const waiting = counts.wait ?? 0;

                monitorLog.info(
                    { queueName: name, ...counts },
                    'Queue metrics snapshot'
                );

                if (waiting >= BACKLOG_CRIT_THRESHOLD) {
                    await alertQueueBacklog(name, waiting).catch(() => {});
                } else if (waiting >= BACKLOG_WARN_THRESHOLD) {
                    monitorLog.warn({ queueName: name, waiting }, 'Queue backlog above warning threshold');
                }
            } catch (err) {
                monitorLog.warn({ err, queueName: name }, 'Failed to sample queue metrics');
            }
        }
    };

    await tick(); // Run immediately on startup
    backlogMonitorTimer = setInterval(tick, INTERVAL);
    monitorLog.info({ interval: INTERVAL }, 'Queue backlog monitor started');
}

export function startApiNodeWorkers(): void {
    workers.push(
        createWorker(QueueName.INBOUND_MESSAGES, processInboundMessage, 5),
        createWorker(QueueName.OUTBOUND_MESSAGES, processOutboundMessage, 5),
        createWorker(QueueName.HISTORY_SYNC, processHistorySync, 1),
        createWorker(QueueName.CONTACTS_SYNC, processContactsSync, 2),
    );

    startHeartbeat();
    startBacklogMonitor();
    log.info('API-bound WhatsApp workers started');
}

export function startBackgroundWorkers(): void {
    workers.push(
        createWorker(QueueName.SYSTEM_EVENTS, processSystemEvent, 3),
        createWorker(QueueName.CAMPAIGN, processCampaignJob, 2),
        createWorker(QueueName.AUTOMATION, processAutomationJob, 5),
        createWorker(QueueName.AI, processAiJob, 3),
        createWorker(QueueName.KNOWLEDGE_OUTREACH, processKnowledgeOutreachJob, 2),
        createWorker(QueueName.KNOWLEDGE_INGESTION, processIncomingKnowledgeJob, 2),
        createWorker(QueueName.LEAD_GENERATION, processLeadGenerationJob, 3),
    );

    startHeartbeat();
    startBacklogMonitor();
    startZombieSweeper();
    log.info('Background workers started');
}

export function startWorkers(): void {
    startApiNodeWorkers();
    startBackgroundWorkers();
    log.info({ count: workers.length, queues: Object.values(QueueName) }, 'All workers started');
}

export async function stopWorkers(): Promise<void> {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (backlogMonitorTimer) clearInterval(backlogMonitorTimer);
    stopZombieSweeper();
    await Promise.all(workers.map(w => w.close()));
    log.info('All workers stopped');
}

export { buildConnection };
