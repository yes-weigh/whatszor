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
import { logger } from './core/logger';
import { connectRedis, disconnectRedis } from './core/redis';
import { connectDatabase, disconnectDatabase } from './prisma/client';
import { startWorkers, stopWorkers } from './queues/worker';

const log = logger.child({ module: 'worker-bootstrap' });

async function bootstrap() {
    log.info(`Starting Whatsvue Worker Process [${env.NODE_ENV}] [Role: ${env.CONTAINER_ROLE}]`);

    // 0. Enforce role isolation
    if (env.CONTAINER_ROLE !== 'worker') {
        log.fatal(`FATAL: Worker process started with CONTAINER_ROLE=${env.CONTAINER_ROLE}. Only 'worker' is allowed here.`);
        process.exit(1);
    }

    // 1. Connect Redis
    await connectRedis();

    // 2. Connect PostgreSQL
    await connectDatabase();

    // 3. Start BullMQ workers for campaigns, automations, AI, and knowledge.
    // NOTE: initializeWorkers() is intentionally NOT called here.
    // initializeWorkers() sets up the inbound-messages/history/contacts BullMQ workers
    // which call realtimeEmit() for live SSE updates. SSE connections only exist in
    // the API process, so those workers MUST run in the API container, not here.
    startWorkers();

    log.info(`🚀 Whatsvue Worker Process started`);

    // 5. Graceful shutdown
    const shutdown = async (signal: string) => {
        log.warn(`Received ${signal} — starting graceful shutdown`);

        try {
            await stopWorkers();
            await disconnectDatabase();
            await disconnectRedis();

            log.info('Graceful shutdown complete');
            process.exit(0);
        } catch (err) {
            log.error({ err }, 'Error during worker shutdown');
            process.exit(1);
        }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', (err) => {
        log.fatal({ err }, 'Uncaught exception in worker');
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        log.fatal({ reason }, 'Unhandled promise rejection in worker');
        process.exit(1);
    });
}

bootstrap().catch((err) => {
    logger.fatal({ err }, 'Failed to start worker process');
    process.exit(1);
});
