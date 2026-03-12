import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../../prisma/client';
import { getRedisClient } from '../../core/redis';

import { env } from '../../env';
import { getAllQueues } from '../../queues/index';
import { waManager } from '../whatsapp/whatsapp.service';

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // Protect all routes with HEALTH_SECRET
    fastify.addHook('preHandler', async (req, reply) => {
        const secretHeader = req.headers['x-health-secret'] || req.headers['health-secret'];
        if (secretHeader !== env.HEALTH_SECRET) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }
    });

    /**
     * GET /health
     * Basic liveness probe — returns immediately.
     */
    fastify.get('/', async (_req, reply) => {
        return reply.status(200).send({
            success: true,
            data: {
                status: 'ok',
                version: '0.1.0',
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
            },
        });
    });

    /**
     * GET /health/ready
     * Readiness probe — checks DB and Redis connectivity.
     */
    fastify.get('/ready', async (_req, reply) => {
        const checks: Record<string, 'ok' | 'error'> = {};

        // Check PostgreSQL
        try {
            await prisma.$queryRaw`SELECT 1`;
            checks.database = 'ok';
        } catch {
            checks.database = 'error';
        }

        // Check Redis
        try {
            const redis = getRedisClient();
            await redis.ping();
            checks.redis = 'ok';
        } catch {
            checks.redis = 'error';
        }

        const allHealthy = Object.values(checks).every((v) => v === 'ok');

        return reply.status(allHealthy ? 200 : 503).send({
            success: allHealthy,
            data: {
                status: allHealthy ? 'ready' : 'degraded',
                checks,
                timestamp: new Date().toISOString(),
            },
        });
    });

    /**
     * GET /health/queues
     * Returns stats for all BullMQ queues.
     */
    fastify.get('/queues', async (_req, reply) => {
        const queues = getAllQueues();
        const stats: Record<string, any> = {};

        for (const [name, queue] of queues.entries()) {
            const jobCounts = await queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
            stats[name] = jobCounts;
        }

        return reply.status(200).send({
            success: true,
            data: {
                timestamp: new Date().toISOString(),
                queues: stats,
            },
        });
    });

    /**
     * GET /health/whatsapp
     * Returns aggregate stats for WhatsApp connections.
     */
    fastify.get('/whatsapp', async (_req, reply) => {
        const stats = waManager.getGlobalStats();

        return reply.status(200).send({
            success: true,
            data: {
                timestamp: new Date().toISOString(),
                ...stats,
            },
        });
    });
};
