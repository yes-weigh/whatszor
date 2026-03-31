import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AdminLoginSchema } from '@whatszor/shared';
import * as adminService from './admin.service';
import { authenticateAdmin } from '../../middleware/authenticateAdmin';
import { prisma } from '../../prisma/client';
import { waManager } from '../whatsapp/whatsapp.service';
import { emitToUser } from '../../core/realtime';
import { logEvent } from '../../core/event-logger';
import { getRedisClient } from '../../core/redis';
import { getQueue, QueueName } from '../../queues';
import { metrics } from '../../core/metrics';
import { invalidateWorkspaceCache } from '../../middleware/requireActiveWorkspace';

export const adminRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

    // ── Auth ──────────────────────────────────────────────────────────────────
    fastify.post('/auth/login', async (req, reply) => {
        const input = AdminLoginSchema.parse(req.body);
        const tokens = await adminService.loginAdmin(input);
        return reply.status(200).send({ success: true, data: tokens });
    });

    // ── Workspace Management ──────────────────────────────────────────────────
    fastify.get('/workspaces', { preHandler: authenticateAdmin }, async (_req, reply) => {
        const workspaces = await adminService.getWorkspaces();
        return reply.status(200).send({ success: true, data: workspaces });
    });

    fastify.post('/workspaces/:id/suspend', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        const { id } = req.params as { id: string };
        // Body: { suspend: boolean } — true to suspend, false to re-activate
        const { suspend = true } = (req.body ?? {}) as { suspend?: boolean };
        await adminService.toggleWorkspaceStatus(id, suspend, req.user.sub);
        // Purge workspace cache immediately so next request enforces the new status
        invalidateWorkspaceCache(id);
        return reply.status(200).send({ success: true });
    });

    fastify.post('/workspaces/:id/activate', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        const { id } = req.params as { id: string };
        await adminService.toggleWorkspaceStatus(id, false, req.user.sub);
        invalidateWorkspaceCache(id);
        return reply.status(200).send({ success: true });
    });

    // ── Impersonation ─────────────────────────────────────────────────────────
    fastify.post('/workspaces/:id/impersonate', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        const { id: workspaceId } = req.params as { id: string };
        const result = await adminService.impersonateWorkspace(
            req.user.sub,
            workspaceId,
            req.ip,
            req.headers['user-agent'] || undefined,
        );
        return reply.status(201).send({
            success: true,
            data: {
                token: result.token,
                expiresAt: result.expiresAt,
                logId: result.logId,
                note: 'Use this token as a Bearer token. It expires per IMPERSONATION_TTL (default 30m) and cannot be renewed.',
            },
        });
    });

    fastify.delete('/workspaces/:id/impersonate/:jti', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        const { jti } = req.params as { id: string; jti: string };
        await adminService.revokeImpersonation(jti, req.user.sub);
        return reply.status(200).send({ success: true, message: 'Impersonation token revoked.' });
    });

    // ── QR Relay ──────────────────────────────────────────────────────────────
    fastify.post('/workspaces/:id/sessions/:sessionId/request-qr', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        const { id: workspaceId, sessionId } = req.params as { id: string; sessionId: string };
        const adminId = req.user.sub;

        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId, deletedAt: null },
            select: { id: true, sessionId: true, userId: true, name: true },
        });

        if (!account) {
            return reply.status(404).send({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Session not found in this workspace' },
            });
        }

        if (!account.userId) {
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Session has no assigned owner. Assign it to a member first via session transfer.',
                },
            });
        }

        const sessionOwnerId = account.userId;

        await prisma.whatsAppAccount.update({
            where: { id: account.id },
            data: { reauthRequiredAt: new Date() },
        });

        waManager.connect(sessionId, workspaceId).catch((err) => {
            fastify.log.error({ err, sessionId }, 'QR relay: waManager.connect failed');
        });

        emitToUser(workspaceId, sessionOwnerId, 'QR_REQUESTED', {
            sessionId,
            sessionName: account.name,
            message: 'An admin has requested you re-scan the QR code for this WhatsApp session.',
            requestedBy: adminId,
            timestamp: new Date().toISOString(),
        });

        await logEvent(workspaceId, 'qr_relay_triggered', 'admin_panel', {
            adminId,
            sessionId,
            sessionOwnerId,
        }).catch(() => {});

        return reply.status(202).send({
            success: true,
            data: {
                message: `QR relay triggered. The session owner will receive a re-scan notification.`,
                sessionId,
                sessionOwnerId,
            },
        });
    });

    // ── System Health ─────────────────────────────────────────────────────────
    /**
     * GET /api/v1/admin/system/health
     * Full system health snapshot: DB, Redis, all queues, worker heartbeat, zombie sweeper.
     * Protected — super-admin only.
     */
    fastify.get('/system/health', { preHandler: authenticateAdmin }, async (_req, reply) => {
        const redis = getRedisClient();

        // DB latency
        let dbStatus: 'ok' | 'error' = 'ok';
        let dbLatencyMs = 0;
        try {
            const t = Date.now();
            await prisma.$queryRaw`SELECT 1`;
            dbLatencyMs = Date.now() - t;
        } catch {
            dbStatus = 'error';
        }

        // Redis latency
        let redisStatus: 'ok' | 'error' = 'ok';
        let redisLatencyMs = 0;
        try {
            const t = Date.now();
            await redis.ping();
            redisLatencyMs = Date.now() - t;
        } catch {
            redisStatus = 'error';
        }

        // Queue depths — all queues in parallel
        const queueNames = Object.values(QueueName);
        const queueStats: Record<string, { waiting: number; active: number; failed: number }> = {};
        await Promise.all(queueNames.map(async (name) => {
            try {
                const q = getQueue(name as QueueName);
                const counts = await q.getJobCounts('wait', 'active', 'failed');
                queueStats[name] = { waiting: counts.wait ?? 0, active: counts.active ?? 0, failed: counts.failed ?? 0 };
            } catch {
                queueStats[name] = { waiting: -1, active: -1, failed: -1 };
            }
        }));

        // Worker heartbeat — set every 5s by worker.ts
        let workerHeartbeat: 'running' | 'stale' | 'offline' = 'offline';
        try {
            const hb = await redis.get('worker:heartbeat');
            if (hb) {
                const age = Date.now() - parseInt(hb, 10);
                workerHeartbeat = age < 15_000 ? 'running' : 'stale';
            }
        } catch { /* offline */ }

        // Global today's metrics
        const today = new Date().toISOString().split('T')[0];
        const [msgSent, msgFailed, campaignsExecuted] = await Promise.all([
            metrics.globalTotal('messages_sent').catch(() => -1),
            metrics.globalTotal('messages_failed').catch(() => -1),
            metrics.globalTotal('campaigns_executed').catch(() => -1),
        ]);

        return reply.sendSuccess({
            timestamp: new Date().toISOString(),
            db: { status: dbStatus, latencyMs: dbLatencyMs },
            redis: { status: redisStatus, latencyMs: redisLatencyMs },
            workers: { heartbeat: workerHeartbeat },
            queues: queueStats,
            todayMetrics: {
                date: today,
                messagesSent: msgSent,
                messagesFailed: msgFailed,
                campaignsExecuted: campaignsExecuted,
            },
        });
    });

    // ── Knowledge Bot Status ──────────────────────────────────────────────────
    /**
     * GET /api/v1/admin/knowledge/status
     * Real-time snapshot of the knowledge bot pipeline state across all workspaces.
     * Protected — super-admin only.
     */
    fastify.get('/knowledge/status', { preHandler: authenticateAdmin }, async (_req, reply) => {
        const today = new Date().toISOString().split('T')[0];

        const [
            incompleteProducts,
            pendingReview,
            totalSources,
            conflictSources,
            appliedSources,
            orphanedSources,
            lastOutreach,
        ] = await Promise.all([
            prisma.productKnowledge.count({ where: { status: 'INCOMPLETE' } }),
            prisma.productKnowledge.count({ where: { status: 'PENDING_REVIEW' } }),
            prisma.productKnowledgeSource.count(),
            prisma.productKnowledgeSource.count({ where: { status: 'CONFLICT' } }),
            prisma.productKnowledgeSource.count({ where: { status: 'APPLIED' } }),
            prisma.productKnowledgeSource.count({ where: { status: 'ORPHANED' } }),
            prisma.productKnowledge.findFirst({
                where: { lastOutreachAt: { not: null } },
                orderBy: { lastOutreachAt: 'desc' },
                select: { lastOutreachAt: true, workspaceId: true },
            }),
        ]);

        // Today's outreach count (uses Redis rate-limit keys set by knowledge.worker.ts)
        // Pattern: bot:ratelimit:outbound:<phone>:<YYYY-MM-DD>
        // We aggregate across all phones for a system-level view.
        const redis = getRedisClient();
        let outreachToday = 0;
        try {
            const rlKeys = await redis.keys(`bot:ratelimit:outbound:*:${today}`);
            if (rlKeys.length > 0) {
                const pipeline = redis.pipeline();
                for (const k of rlKeys) pipeline.get(k);
                const results = await pipeline.exec();
                outreachToday = (results ?? []).reduce((sum, r) => {
                    const v = r?.[1] as string | null;
                    return sum + (v ? parseInt(v, 10) : 0);
                }, 0);
            }
        } catch { /* non-blocking */ }

        // Global bot metrics for today
        const botMetrics = await Promise.all([
            metrics.globalTotal('bot_questions_asked').catch(() => -1),
            metrics.globalTotal('bot_responses_received').catch(() => -1),
            metrics.globalTotal('bot_updates_applied').catch(() => -1),
        ]);
        const [questionsAsked, responsesReceived, updatesApplied] = botMetrics;

        const completionRate = questionsAsked > 0
            ? `${Math.round((updatesApplied / questionsAsked) * 100)}%`
            : 'n/a';

        return reply.sendSuccess({
            timestamp: new Date().toISOString(),
            products: {
                incomplete: incompleteProducts,
                pendingReview,
                total: incompleteProducts + pendingReview + (await prisma.productKnowledge.count({ where: { status: 'VERIFIED' } })),
            },
            sources: {
                total: totalSources,
                applied: appliedSources,
                conflict: conflictSources,
                orphaned: orphanedSources,
            },
            outreach: {
                today: outreachToday,
                lastOutreachAt: lastOutreach?.lastOutreachAt?.toISOString() ?? null,
            },
            botMetrics: {
                date: today,
                questionsAsked,
                responsesReceived,
                updatesApplied,
                completionRate,
            },
        });
    });
};

