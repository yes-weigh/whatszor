/**
 * core/monitor.ts — Autonomous Performance Monitor
 *
 * A lightweight, self-contained monitoring daemon that runs inside the
 * API and Worker nodes. No external dependencies (no Prometheus, no StatsD).
 * All metrics are emitted as structured Pino log lines and accumulated in
 * an in-process snapshot object that's exposed at /system/health.
 *
 * What it tracks:
 *   1. Event loop lag   — setTimeout drift probe every 1s
 *                         P50/P95/P99 over a rolling 30-sample window
 *                         Fires warn > 50ms, error > 200ms
 *
 *   2. DB writes/sec    — Prisma middleware patches $use to count mutations
 *                         Accumulates in a rolling 5s window
 *                         Fires warn > 300 writes/5s, error > 500 writes/5s
 *
 *   3. Queue job latency — Sampled in wrapProcessor() via instrumentJobLatency()
 *                          P50/P99 per queue over last 100 samples
 *
 *   4. Process stats    — heapUsed, rss, uptime — sampled every 30s
 *
 * Usage:
 *   import { startMonitor, stopMonitor, getMonitorSnapshot } from './monitor';
 *   startMonitor();           // call once at worker/server startup
 *   getMonitorSnapshot();     // returns the live snapshot for /system/health
 *   stopMonitor();            // call on graceful shutdown
 *
 * Job Latency Usage (in wrapProcessor):
 *   instrumentJobLatency(queueName, job.timestamp, job.processedOn ?? Date.now());
 */
import { prisma } from '../prisma/client';
import { createLogger } from './logger';
import { getAllQueues } from '../queues';

const log = createLogger({ module: 'monitor' });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Event Loop Lag Probe
// ─────────────────────────────────────────────────────────────────────────────

const EL_PROBE_INTERVAL_MS = 1_000;
const EL_SAMPLE_WINDOW = 30; // keep last 30 samples
const EL_WARN_MS = 50;
const EL_ERROR_MS = 200;

const elSamples: number[] = [];

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function probeEventLoop() {
    const start = process.hrtime.bigint();
    setImmediate(() => {
        const lagMs = Number(process.hrtime.bigint() - start) / 1e6;
        elSamples.push(lagMs);
        if (elSamples.length > EL_SAMPLE_WINDOW) elSamples.shift();

        if (lagMs > EL_ERROR_MS) {
            log.error({ lagMs }, 'Event loop lag CRITICAL — system overloaded');
        } else if (lagMs > EL_WARN_MS) {
            log.warn({ lagMs }, 'Event loop lag elevated — approaching saturation');
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DB Write Counter (Prisma Middleware)
// ─────────────────────────────────────────────────────────────────────────────

const DB_WINDOW_MS = 5_000;
const DB_WARN_WRITES_PER_WINDOW = 5_000;
const DB_ERROR_WRITES_PER_WINDOW = 10_000;

const WRITE_OPERATIONS = new Set([
    'create', 'createMany', 'update', 'updateMany',
    'upsert', 'delete', 'deleteMany',
]);

interface WriteWindow {
    count: number;
    windowStart: number;
}

const dbWriteWindow: WriteWindow = { count: 0, windowStart: Date.now() };
let dbMiddlewareInstalled = false;

function installDbWriteMiddleware() {
    if (dbMiddlewareInstalled) return;
    dbMiddlewareInstalled = true;

    (prisma as any).$use(async (params: any, next: any) => {
        const result = await next(params);

        if (WRITE_OPERATIONS.has(params.action)) {
            const now = Date.now();
            // Roll the window if it's expired
            if (now - dbWriteWindow.windowStart > DB_WINDOW_MS) {
                const writesPerWindow = dbWriteWindow.count;
                if (writesPerWindow >= DB_ERROR_WRITES_PER_WINDOW) {
                    log.error({ writesPerWindow, windowMs: DB_WINDOW_MS }, 'DB write storm CRITICAL');
                } else if (writesPerWindow >= DB_WARN_WRITES_PER_WINDOW) {
                    log.warn({ writesPerWindow, windowMs: DB_WINDOW_MS }, 'DB write rate elevated');
                }
                dbWriteWindow.count = 0;
                dbWriteWindow.windowStart = now;
            }
            dbWriteWindow.count++;
        }

        return result;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Queue Job Latency Sampler
// ─────────────────────────────────────────────────────────────────────────────

const LATENCY_SAMPLE_SIZE = 100; // rolling window per queue

const queueLatencySamples = new Map<string, number[]>(); // queueName → [latency_ms]

/**
 * Record a job's processing latency.
 * Call this in wrapProcessor() after a job completes.
 *
 * @param queueName  - The queue the job was processed from
 * @param enqueuedAt - Unix ms timestamp when the job was added to the queue (job.timestamp)
 * @param startedAt  - Unix ms timestamp when the job started processing (job.processedOn)
 */
export function instrumentJobLatency(queueName: string, enqueuedAt: number, startedAt: number): void {
    const latencyMs = Math.max(0, startedAt - enqueuedAt);
    let samples = queueLatencySamples.get(queueName);
    if (!samples) {
        samples = [];
        queueLatencySamples.set(queueName, samples);
    }
    samples.push(latencyMs);
    if (samples.length > LATENCY_SAMPLE_SIZE) samples.shift();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Process Stats
// ─────────────────────────────────────────────────────────────────────────────

interface ProcessStats {
    heapUsedMb: number;
    rssMb: number;
    uptimeSec: number;
    pid: number;
}

function sampleProcessStats(): ProcessStats {
    const mem = process.memoryUsage();
    return {
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        rssMb: Math.round(mem.rss / 1024 / 1024),
        uptimeSec: Math.round(process.uptime()),
        pid: process.pid,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Queue depth snapshot (used for /system/health)
// ─────────────────────────────────────────────────────────────────────────────

interface QueueDepthSnapshot {
    [queueName: string]: {
        waiting: number;
        active: number;
        failed: number;
        latencyP50Ms: number;
        latencyP99Ms: number;
    };
}

let queueDepthSnapshot: QueueDepthSnapshot = {};

async function sampleQueueDepths() {
    const queues = getAllQueues();
    const next: QueueDepthSnapshot = {};

    for (const [name, queue] of queues.entries()) {
        try {
            const counts = await queue.getJobCounts('wait', 'active', 'failed');
            const samples = queueLatencySamples.get(name) ?? [];
            const sorted = [...samples].sort((a, b) => a - b);

            next[name] = {
                waiting: counts.wait ?? 0,
                active: counts.active ?? 0,
                failed: counts.failed ?? 0,
                latencyP50Ms: percentile(sorted, 50),
                latencyP99Ms: percentile(sorted, 99),
            };
        } catch {
            // Preserve last known value on error
            next[name] = queueDepthSnapshot[name] ?? { waiting: 0, active: 0, failed: 0, latencyP50Ms: 0, latencyP99Ms: 0 };
        }
    }

    queueDepthSnapshot = next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Monitor Snapshot (exported for /system/health)
// ─────────────────────────────────────────────────────────────────────────────

export interface MonitorSnapshot {
    sampledAt: string;
    eventLoop: {
        p50Ms: number;
        p95Ms: number;
        p99Ms: number;
        latestMs: number;
    };
    db: {
        writesInLastWindowCount: number;
        windowMs: number;
        writesPerSec: number;
    };
    process: ProcessStats;
    queues: QueueDepthSnapshot;
}

export function getMonitorSnapshot(): MonitorSnapshot {
    const sorted = [...elSamples].sort((a, b) => a - b);
    const writesPerSec = dbWriteWindow.count / (DB_WINDOW_MS / 1000);

    return {
        sampledAt: new Date().toISOString(),
        eventLoop: {
            p50Ms: Math.round(percentile(sorted, 50) * 10) / 10,
            p95Ms: Math.round(percentile(sorted, 95) * 10) / 10,
            p99Ms: Math.round(percentile(sorted, 99) * 10) / 10,
            latestMs: Math.round((elSamples[elSamples.length - 1] ?? 0) * 10) / 10,
        },
        db: {
            writesInLastWindowCount: dbWriteWindow.count,
            windowMs: DB_WINDOW_MS,
            writesPerSec: Math.round(writesPerSec * 10) / 10,
        },
        process: sampleProcessStats(),
        queues: queueDepthSnapshot,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let elProbeTimer: NodeJS.Timeout | null = null;
let queueSampleTimer: NodeJS.Timeout | null = null;
let processLogTimer: NodeJS.Timeout | null = null;

/**
 * Start the monitoring daemon. Call once at process startup.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startMonitor(): void {
    if (elProbeTimer) return; // already running

    // Install DB write middleware (idempotent)
    installDbWriteMiddleware();

    // 1. Event loop lag probe every 1s
    elProbeTimer = setInterval(probeEventLoop, EL_PROBE_INTERVAL_MS);

    // 2. Queue depth sampling every 10s (light — one Redis call per queue)
    queueSampleTimer = setInterval(() => {
        sampleQueueDepths().catch(() => {});
    }, 10_000);
    sampleQueueDepths().catch(() => {}); // immediate first sample

    // 3. Process stats log every 30s
    processLogTimer = setInterval(() => {
        const stats = sampleProcessStats();
        log.info(stats, 'Process stats snapshot');

        // Warn if heap > 4GB on a 6GB machine  
        if (stats.heapUsedMb > 4096) {
            log.error({ heapUsedMb: stats.heapUsedMb }, 'Heap usage CRITICAL — approaching 6 GB limit');
        } else if (stats.heapUsedMb > 3072) {
            log.warn({ heapUsedMb: stats.heapUsedMb }, 'Heap usage elevated — consider restarting worker');
        }
    }, 30_000);

    log.info('Performance monitor started');
}

/**
 * Stop the monitoring daemon. Call during graceful shutdown.
 */
export function stopMonitor(): void {
    if (elProbeTimer) { clearInterval(elProbeTimer); elProbeTimer = null; }
    if (queueSampleTimer) { clearInterval(queueSampleTimer); queueSampleTimer = null; }
    if (processLogTimer) { clearInterval(processLogTimer); processLogTimer = null; }
    log.info('Performance monitor stopped');
}
