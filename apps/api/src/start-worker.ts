/**
 * Whatsvue Background Worker — Entry Point
 *
 * Startup sequence:
 * 1. Validate environment
 * 2. Connect Redis
 * 3. Connect Database
 * 4. Start BullMQ workers
 * 5. Register graceful shutdown hooks
 */
import { env } from './env';
import { createLogger } from './core/logger';
import { alertWorkerCrash } from './core/alert';
import { connectRedis, disconnectRedis, getRedisClient } from './core/redis';
import { preloadLuaScripts } from './core/lua-scripts';
import { connectDatabase, disconnectDatabase } from './prisma/client';
import { startBackgroundWorkers, stopWorkers } from './queues/worker';
import { flushMessageBuffer } from './core/message-buffer';

const log = createLogger({ module: 'worker-bootstrap', action: 'startup' });

async function bootstrap() {
    log.info(`Starting Whatsvue Worker Process [${env.NODE_ENV}] [Role: ${env.CONTAINER_ROLE}]`);

    // 0. Enforce role isolation
    if (env.CONTAINER_ROLE !== 'worker') {
        log.fatal(`FATAL: Worker process started with CONTAINER_ROLE=${env.CONTAINER_ROLE}. Only 'worker' is allowed here.`);
        process.exit(1);
    }

    // 1. Connect Redis & Preload Lua
    await connectRedis();
    await preloadLuaScripts(getRedisClient());

    // 2. Connect PostgreSQL
    await connectDatabase();

    // 3. Start BullMQ workers for campaigns, automations, AI, and knowledge.
    // NOTE: initializeWorkers() is intentionally NOT called here.
    // initializeWorkers() sets up the inbound-messages/history/contacts BullMQ workers
    // which call realtimeEmit() for live SSE updates. SSE connections only exist in
    // the API process, so those workers MUST run in the API container, not here.
    startBackgroundWorkers();

    log.info(`🚀 Whatsvue Worker Process started`);

    // 5. Graceful shutdown
    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        log.warn(`Received ${signal} — starting graceful shutdown`);

        // Force exit after 25s if cleanup hangs
        const forceExitTimeout = setTimeout(() => {
            log.fatal({ signal, timeout: '25s' }, 'Graceful shutdown timed out — forcing exit');
            process.exit(1);
        }, 25_000);

        try {
            log.info('Stopping workers...');
            await stopWorkers();
            log.info('Workers stopped');

            log.info('Flushing async buffers...');
            const { flushPendingEvents, setEventLoggerShuttingDown } = require('./core/event-logger');
            const { flushPendingAutomationLogs, setAutomationLogShuttingDown } = require('./modules/automation/keyword-automation.service');
            
            // Seal buffers from new entries
            setEventLoggerShuttingDown();
            setAutomationLogShuttingDown();

            // FIX (BUG-10): drain message buffer first, before events
            await flushMessageBuffer();

            await Promise.allSettled([
                flushPendingEvents(),
                flushPendingAutomationLogs()
            ]);
            log.info('Buffers flushed');

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
            log.error({ err }, 'Error during worker shutdown');
            process.exit(1);
        }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', async (err) => {
        log.fatal({ err }, 'Uncaught exception in worker');
        await alertWorkerCrash(err).catch(() => {});
        process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
        log.fatal({ reason }, 'Unhandled promise rejection in worker');
        await alertWorkerCrash(reason).catch(() => {});
        process.exit(1);
    });
}

bootstrap().catch((err) => {
    createLogger({ module: 'worker-bootstrap', action: 'startup' }).fatal({ err }, 'Failed to start worker process');
    process.exit(1);
});
