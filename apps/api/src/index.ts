/**
 * YesBheem API — Entry Point
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
import { logger } from './core/logger';
import { connectRedis, disconnectRedis } from './core/redis';
import { connectDatabase, disconnectDatabase } from './prisma/client';
import { initQueues, closeQueues } from './queues/index';
import { startWorkers, stopWorkers } from './queues/worker';
import { initializeWorkers } from './core/queue';
import { createServer } from './core/server';
import { waManager } from './modules/whatsapp/whatsapp.service';

const log = logger.child({ module: 'bootstrap' });

async function bootstrap() {
    log.info(`Starting YesBheem API [${env.NODE_ENV}]`);

    // 1. Connect Redis
    await connectRedis();

    // 2. Connect PostgreSQL
    await connectDatabase();

    // 3. Initialize BullMQ queues
    initQueues();

    // 4. Start BullMQ workers (only if enabled)
    if (env.WORKER_ENABLED) {
        log.info('Workers are enabled on this instance (WORKER_ENABLED=true). Starting workers.');
        startWorkers();
        initializeWorkers();
        
        // 4.5. Restore global WhatsApp sessions
        await waManager.restoreAllSessions();
    } else {
        log.info('Workers are disabled on this instance (WORKER_ENABLED=false). Skipping workers.');
    }

    // 5. Create Fastify server
    const server = await createServer();

    // 6. Listen
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    log.info(`🚀 YesBheem API listening on http://0.0.0.0:${env.PORT}`);
    log.info(`   Health   → GET http://localhost:${env.PORT}/health`);
    log.info(`   Readiness→ GET http://localhost:${env.PORT}/health/ready`);

    // 7. Graceful shutdown
    const shutdown = async (signal: string) => {
        log.warn(`Received ${signal} — starting graceful shutdown`);

        try {
            // Stop accepting new requests
            await server.close();

            // Drain workers before closing queues if they were running
            if (env.WORKER_ENABLED) {
                await stopWorkers();
                await waManager.closeAll();
            }
            await closeQueues();

            // Disconnect data stores
            await disconnectDatabase();
            await disconnectRedis();

            log.info('Graceful shutdown complete');
            process.exit(0);
        } catch (err) {
            log.error({ err }, 'Error during shutdown');
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
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
});
