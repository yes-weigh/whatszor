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
import { initializeWorkers } from './core/queue';
import { waManager } from './modules/whatsapp/whatsapp.service';

const log = logger.child({ module: 'worker-bootstrap' });

async function bootstrap() {
    log.info(`Starting Whatsvue Worker Process [${env.NODE_ENV}]`);

    // 1. Connect Redis
    await connectRedis();

    // 2. Connect PostgreSQL
    await connectDatabase();

    // 3. Start BullMQ workers
    startWorkers();
    initializeWorkers();

    // 4. Restore global WhatsApp sessions
    // Workers might need WhatsApp session access depending on queue operations
    await waManager.restoreAllSessions();

    log.info(`🚀 Whatsvue Worker Process started`);

    // 5. Graceful shutdown
    const shutdown = async (signal: string) => {
        log.warn(`Received ${signal} — starting graceful shutdown`);

        try {
            await stopWorkers();
            await waManager.closeAll();
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
