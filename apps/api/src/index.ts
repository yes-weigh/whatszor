/**
 * Whatsvue API — Entry Point
 *
 * Startup sequence:
 * 1. Validate environment
 * 2. Connect Redis
 * 3. Connect Database
 * 4. Initialize queues
 * 5. Start BullMQ workers
 * 6. Create and start Fastify server
 * 7. Register graceful shutdown hooks
 */
import { env } from './env';
import { createLogger } from './core/logger';
import { connectRedis, disconnectRedis, getRedisClient } from './core/redis';
import { preloadLuaScripts } from './core/lua-scripts';
import { connectDatabase, disconnectDatabase } from './prisma/client';
import { initQueues, closeQueues, getQueue, QueueName } from './queues/index';
import { startApiNodeWorkers, startBackgroundWorkers, stopWorkers } from './queues/worker';
import { initializeWorkers } from './core/queue';
import { createServer } from './core/server';
import { waManager } from './modules/whatsapp/whatsapp.service';
import { flushMessageBuffer } from './core/message-buffer';

const log = createLogger({ module: 'bootstrap' });

async function bootstrap() {
    log.info(`Starting Whatsvue API [${env.NODE_ENV}] [Role: ${env.CONTAINER_ROLE}]`);

    // 0. Enforce role isolation
    if (env.CONTAINER_ROLE === 'worker') {
        log.fatal('FATAL: API process started with CONTAINER_ROLE=worker. Use start-worker.js instead.');
        process.exit(1);
    }

    // 1. Connect Redis & Preload Lua
    await connectRedis();
    await preloadLuaScripts(getRedisClient());

    // 2. Connect PostgreSQL
    await connectDatabase();

    // 3. Initialize BullMQ queues
    initQueues();

    // 4. Initialize BullMQ event bridges — ALWAYS required in the API container.
    // initializeWorkers() registers waManager.on('history'/'messages'/'contacts') listeners
    // that bridge WhatsApp events into BullMQ queues. Without this, WA events fire but
    // nobody queues them and the worker container never receives any jobs.
    initializeWorkers();

    // 4.5. Start API-bound BullMQ workers in this process — ALWAYS required in the API container.
    // These workers (inbound, outbound, sync) require direct in-memory access to
    // Baileys sockets, which ONLY live in the API container.
    log.info('Starting API-bound workers...');
    startApiNodeWorkers();

    // Also start general background worker processors in this process if explicitly enabled.
    // In the standard production setup, WORKER_ENABLED=false here and the separate
    // worker container runs the general processors instead.
    if (env.WORKER_ENABLED) {
        log.info('Workers are enabled on this instance (WORKER_ENABLED=true). Starting background workers.');
        startBackgroundWorkers();
    } else {
        log.info('Background workers are disabled on this instance (WORKER_ENABLED=false). Worker container handles processing.');
    }

    // 4.5. Restore global WhatsApp sessions — always, regardless of WORKER_ENABLED.
    // The API container is the SOLE owner of Baileys sockets. The worker container
    // handles only BullMQ job processing and must NOT call restoreAllSessions().
    await waManager.restoreAllSessions();

    // 4.6. Schedule the Automation Insights scan (self-learning revenue engine).
    // Runs every 30 minutes on the AUTOMATION queue. Deduplicates via BullMQ repeat key.
    // Also fires an immediate scan so insights are available on first launch.
    try {
        const automationQueue = getQueue(QueueName.AUTOMATION);
        await automationQueue.add(
            'insight-scan',
            { traceId: 'scheduled-insight-scan' },
            { repeat: { every: 30 * 60 * 1000 }, jobId: 'insight-scan-recurring' }
        );
        // Immediate first run (delayed 10s to let workers finish starting)
        await automationQueue.add(
            'insight-scan',
            { traceId: 'insight-scan-init' },
            { delay: 10_000, jobId: `insight-scan-init-${Date.now()}` }
        );
        log.info('Automation insight scan scheduled (every 30 min)');
    } catch (err) {
        log.warn({ err }, 'Failed to schedule insight scan — non-fatal');
    }

    // 5. Create Fastify server
    const server = await createServer();

    // 6. Listen
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    log.info(`🚀 Whatsvue API listening on http://0.0.0.0:${env.PORT}`);
    log.info(`   Health   → GET http://localhost:${env.PORT}/health`);
    log.info(`   Readiness→ GET http://localhost:${env.PORT}/health/ready`);

    // 7. Graceful shutdown
    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        log.warn({ signal }, 'Received termination signal — starting graceful shutdown');

        // Force exit after 25s if cleanup hangs
        const forceExitTimeout = setTimeout(() => {
            log.fatal({ signal, timeout: '25s' }, 'Graceful shutdown timed out — forcing exit');
            process.exit(1);
        }, 25_000);

        try {
            // 1. Drain BullMQ workers if running in this process
            // We do this BEFORE closing the server to ensure no new heavy background 
            // jobs are picked up while we're waiting for the webserver to drain.
            if (env.WORKER_ENABLED) {
                log.info('Stopping workers...');
                await stopWorkers();
                log.info('Workers stopped');
            }

            // 2. Stop accepting new HTTP requests
            log.info('Closing HTTP server...');
            await server.close();
            log.info('HTTP server closed');

            // 3. Close WhatsApp sockets (detaches Baileys and persists state)
            log.info('Closing WhatsApp sessions...');
            await waManager.closeAll();
            log.info('WhatsApp sessions closed');

            // 4. Close BullMQ queue handles
            log.info('Closing queues...');
            await closeQueues();
            log.info('Queues closed');

            // 5. Flush all asynchronous memory buffers to database
            log.info('Flushing async buffers...');
            const { flushPendingEvents, setEventLoggerShuttingDown } = require('./core/event-logger');
            const { flushPendingAutomationLogs, setAutomationLogShuttingDown } = require('./modules/automation/keyword-automation.service');
            
            // Seal buffers from new entries
            setEventLoggerShuttingDown();
            setAutomationLogShuttingDown();

            // FIX (BUG-10): flush message buffer explicitly before events.
            // Messages must land in DB first because event records may reference messageIds.
            // The old process.on('beforeExit') hook in message-buffer.ts never fires
            // when process.exit() is called directly.
            await flushMessageBuffer();

            await Promise.allSettled([
                flushPendingEvents(),
                flushPendingAutomationLogs()
            ]);
            log.info('Buffers flushed');

            // 6. Hardened disconnection of data stores
            log.info('Disconnecting database and redis...');
            await Promise.allSettled([
                disconnectDatabase(),
                disconnectRedis()
            ]);
            log.info('Data stores disconnected');

            clearTimeout(forceExitTimeout);
            log.info('Graceful shutdown complete');
            process.exit(0);
        } catch (err) {
            log.error({ err, signal }, 'Error during graceful shutdown');
            process.exit(1);
        }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors — log and exit so the process manager restarts
    process.on('uncaughtException', (err) => {
        log.fatal({ err }, 'Uncaught exception');
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        log.fatal({ reason }, 'Unhandled promise rejection');
        process.exit(1);
    });
}

bootstrap().catch((err) => {
    log.fatal({ err }, 'Failed to start server');
    process.exit(1);
});
