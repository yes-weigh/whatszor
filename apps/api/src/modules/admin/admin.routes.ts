import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AdminLoginSchema } from '@whatszor/shared';
import * as adminService from './admin.service';
import * as dlqService from './dlq.service';
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

    // ── System Config ─────────────────────────────────────────────────────────
    fastify.get('/config', { preHandler: authenticateAdmin }, async (_req, reply) => {
        const { getAllSystemConfigs } = await import('./config.service');
        const configs = await getAllSystemConfigs();
        return reply.status(200).send({ success: true, data: configs });
    });

    fastify.put('/config', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        const { setSystemConfig } = await import('./config.service');
        const updates = req.body as Record<string, any>;
        
        for (const [key, value] of Object.entries(updates)) {
            await setSystemConfig(key, value);
        }
        
        return reply.status(200).send({ success: true, message: 'Configuration updated.' });
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

        logEvent(workspaceId, 'qr_relay_triggered', 'admin_panel', {
            adminId,
            sessionId,
            sessionOwnerId,
        });

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

    // ── Dead Letter Queue ─────────────────────────────────────────────────────
    /**
     * GET  /api/v1/admin/dlq/stats
     *   Aggregate counts by status + queue. Use for the admin dashboard badge.
     *
     * GET  /api/v1/admin/dlq
     *   Paginated list. Supports ?queueName=outbound-messages&status=PENDING_REVIEW
     *   &workspaceId=xxx&since=2026-04-01T00:00:00Z&skip=0&take=50
     *
     * GET  /api/v1/admin/dlq/:id
     *   Full entry including the original job payload and stack trace.
     *
     * POST /api/v1/admin/dlq/:id/replay
     *   Re-enqueue the original payload to BullMQ. Idempotent — 409 if already REPLAYED.
     *
     * POST /api/v1/admin/dlq/bulk-replay
     *   Replay multiple entries. Body: { ids: string[] } (max 100).
     *
     * POST /api/v1/admin/dlq/:id/discard
     *   Mark as DISCARDED — will not be replayed.
     *
     * DELETE /api/v1/admin/dlq/purge
     *   Hard-delete DISCARDED + REPLAYED entries older than ?olderThanDays=30.
     *   Destructive — protected by a confirmation header.
     */

    // GET /dlq/stats
    fastify.get('/dlq/stats', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        try {
            const { workspaceId } = req.query as { workspaceId?: string };
            const stats = await dlqService.getDlqStats(workspaceId);
            return reply.sendSuccess(stats);
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // GET /dlq
    fastify.get('/dlq', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        try {
            const q = req.query as {
                queueName?: string;
                status?: string;
                workspaceId?: string;
                since?: string;
                skip?: string;
                take?: string;
            };

            const result = await dlqService.listDlqEntries({
                queueName: q.queueName,
                status: q.status as any,
                workspaceId: q.workspaceId,
                since: q.since,
                skip: q.skip ? parseInt(q.skip, 10) : undefined,
                take: q.take ? parseInt(q.take, 10) : undefined,
            });

            return reply.sendSuccess(result);
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // GET /dlq/:id
    fastify.get('/dlq/:id', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        try {
            const { id } = req.params as { id: string };
            const entry = await dlqService.getDlqEntry(id);
            return reply.sendSuccess(entry);
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // POST /dlq/:id/replay
    fastify.post('/dlq/:id/replay', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        try {
            const { id } = req.params as { id: string };
            const replayedBy: string = req.user.sub;
            const result = await dlqService.replayDlqEntry(id, replayedBy);
            return reply.code(202).sendSuccess({
                message: `Job ${result.dlqId} re-enqueued to [${result.queueName}] as ${result.newJobId}`,
                ...result,
            });
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // POST /dlq/bulk-replay
    fastify.post('/dlq/bulk-replay', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        try {
            const { ids } = req.body as { ids?: string[] };
            if (!Array.isArray(ids) || ids.length === 0) {
                return reply.sendError({ message: 'ids must be a non-empty array', code: 'BAD_REQUEST' }, 400);
            }
            const replayedBy: string = req.user.sub;
            const result = await dlqService.bulkReplayDlqEntries(ids, replayedBy);
            return reply.code(202).sendSuccess(result);
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // POST /dlq/:id/discard
    fastify.post('/dlq/:id/discard', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        try {
            const { id } = req.params as { id: string };
            await dlqService.discardDlqEntry(id);
            return reply.sendSuccess({ message: `DLQ entry ${id} discarded.` });
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // DELETE /dlq/purge?olderThanDays=30
    // Requires the header: x-confirm-purge: yes
    // This permanently deletes closed DLQ entries — intended for scheduled maintenance.
    fastify.delete('/dlq/purge', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        try {
            const confirm = req.headers['x-confirm-purge'];
            if (confirm !== 'yes') {
                return reply.sendError(
                    { message: 'Send header x-confirm-purge: yes to confirm purge', code: 'CONFIRMATION_REQUIRED' },
                    400,
                );
            }

            const { olderThanDays = '30' } = req.query as { olderThanDays?: string };
            const days = Math.max(1, parseInt(olderThanDays, 10) || 30);
            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            const { count } = await prisma.deadLetterJob.deleteMany({
                where: {
                    status: { in: ['DISCARDED', 'REPLAYED'] },
                    createdAt: { lt: cutoff },
                },
            });

            return reply.sendSuccess({
                message: `Purged ${count} closed DLQ entries older than ${days} days.`,
                deleted: count,
                cutoffDate: cutoff.toISOString(),
            });
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });
};


