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
        // Determine active sessions across the manager instance
        const activeSessions = Object.keys((waManager as any).sessions || {}).length;

        return reply.status(200).send({
            success: true,
            data: {
                timestamp: new Date().toISOString(),
                activeSessions,
                status: 'operational'
            },
        });
    });

    /**
     * GET /health/lid-status
     * Reports how many LID→phone mappings are currently in Baileys' in-memory store.
     * Call this first to verify contacts have synced before running heal-lids.
     */
    fastify.get('/lid-status', async (_req, reply) => {
        const sessions: Array<{ sessionId: string; storeSize: number; lidMappings: number }> = [];
        let totalLids = 0;

        for (const sessionId of Array.from((waManager as any).sockets.keys() as Iterable<string>)) {
            const store = waManager.getContactsStore(sessionId);
            let lidCount = 0;
            for (const [key, val] of store.entries()) {
                if (key.endsWith('@lid') && !val.jid.endsWith('@lid')) lidCount++;
            }
            sessions.push({ sessionId, storeSize: store.size, lidMappings: lidCount });
            totalLids += lidCount;
        }

        const dbLidCount = await prisma.conversation.count({
            where: { providerId: { endsWith: '@lid' } }
        });

        return reply.send({ 
            success: true, 
            data: { sessions, totalLidMappings: totalLids, dbLidConversations: dbLidCount },
        });
    });

    /**
     * POST /health/heal-lids
     * Retroactively sweeps the database for conversations stuck with @lid identifiers
     * and maps them back to real phone number JIDs using Baileys in-memory cache.
     */
    fastify.post('/heal-lids', async (_req, reply) => {
        let healed = 0;
        let checked = 0;
        let notResolved = 0;
        const globalLidMap = new Map<string, string>(); // lid → real JID

        // Build global LID map from all active sessions
        for (const sessionId of Array.from((waManager as any).sockets.keys() as Iterable<string>)) {
            const store = waManager.getContactsStore(sessionId);
            for (const [key, val] of store.entries()) {
                if (key.endsWith('@lid') && val.jid && !val.jid.endsWith('@lid')) {
                    globalLidMap.set(key, val.jid);
                }
            }
        }

        if (globalLidMap.size === 0) {
            return reply.send({ 
                success: false, 
                error: 'Contact store is empty. WhatsApp may still be syncing. Wait 2-3 minutes after startup and try again.',
                healed: 0,
            });
        }

        // Find all restricted @lid conversations
        const lidConvs = await prisma.conversation.findMany({
            where: { providerId: { endsWith: '@lid' } },
            select: { id: true, providerId: true, workspaceId: true },
        });

        checked = lidConvs.length;

        for (const conv of lidConvs) {
            const resolvedJid = globalLidMap.get(conv.providerId);
            if (!resolvedJid) { notResolved++; continue; }

            const realPhone = resolvedJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
            const oldLidNum = conv.providerId.replace('@lid', '');

            // Update conversation providerId
            await prisma.conversation.update({
                where: { id: conv.id },
                data: { providerId: resolvedJid }
            });

            // Also heal any CRM contact stuck with the lid number as their phone
            await prisma.contact.updateMany({
                where: { workspaceId: conv.workspaceId, phone: oldLidNum },
                data: { phone: realPhone },
            }).catch(() => {}); // non-fatal

            healed++;
        }

        return reply.send({ success: true, checked, healed, notResolved, lidMappingsInMemory: globalLidMap.size });
    });
};
