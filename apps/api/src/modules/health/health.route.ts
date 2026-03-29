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
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
            },
        });
    });

    /**
     * GET /health/ready
     * Readiness probe — checks DB, Redis, and Worker heartbeat.
     */
    fastify.get('/ready', async (_req, reply) => {
        const checks: Record<string, { status: 'ok' | 'error' | 'stale'; latencyMs?: number }> = {};
        const redis = getRedisClient();

        // 1. PostgreSQL Check & Latency
        const dbStart = Date.now();
        try {
            await prisma.$queryRaw`SELECT 1`;
            checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
        } catch {
            checks.database = { status: 'error' };
        }

        // 2. Redis Check & Latency
        const redisStart = Date.now();
        try {
            await redis.ping();
            checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
        } catch {
            checks.redis = { status: 'error' };
        }

        // 3. Worker Heartbeat Check
        try {
            const lastHeartbeat = await redis.get('worker:heartbeat');
            if (lastHeartbeat) {
                const ageMs = Date.now() - parseInt(lastHeartbeat, 10);
                checks.worker = { 
                    status: ageMs < 10000 ? 'ok' : 'stale',
                    latencyMs: ageMs 
                };
            } else {
                checks.worker = { status: 'error' };
            }
        } catch {
            checks.worker = { status: 'error' };
        }

        const allHealthy = Object.values(checks).every((c) => c.status === 'ok');

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
     * Returns stats for all BullMQ queues including backlog and staleness detection.
     */
    fastify.get('/queues', async (_req, reply) => {
        const queues = getAllQueues();
        const stats: Record<string, any> = {};

        for (const [name, queue] of queues.entries()) {
            const counts = await queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
            const waiting = await queue.getWaitingCount();
            
            stats[name] = {
                ...counts,
                isStalled: counts.active > 0 && waiting > 100, // Simple heuristic for stall detection
                backlogLevel: waiting > 1000 ? 'critical' : waiting > 100 ? 'warning' : 'nominal'
            };
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
