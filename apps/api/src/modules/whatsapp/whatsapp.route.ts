import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import { waManager } from './whatsapp.service';
import { prisma } from '../../prisma/client';
import { randomUUID } from 'crypto';
import { getAntibanStats } from '../../core/antiban';
import { logEvent } from '../../core/event-logger';

import { requireActiveWorkspace } from '../../middleware/requireActiveWorkspace';

export const whatsappRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', requireActiveWorkspace);

    /**
     * GET /sessions
     * List all WhatsApp accounts for this workspace with live socket status.
     */
    fastify.get('/sessions', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const sessions = await waManager.getSessions(ctx);
        return reply.sendSuccess(sessions);
    });

    /**
     * POST /sessions
     * Create a new named WhatsApp account placeholder (before scanning QR).
     * Body: { name: string }
     */
    fastify.post('/sessions', async (req, reply) => {
        const { name } = req.body as { name?: string };

        if (!name || name.trim().length < 1) {
            return reply.sendError({ message: 'Account name is required.', code: 'BAD_REQUEST' }, 400);
        }

        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };

        const sessionId = randomUUID();

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.create(ctx, {
            sessionId,
            name: name.trim(),
            status: 'DISCONNECTED',
            label: null,
            phoneNumber: null,
            botMode: null,
            lastActiveAt: null,
            // deletedAt and workspaceId, userId are handled inside the repository's create
        }));

        return reply.sendSuccess(account, 201);
    });

    /**
     * POST /sessions/:sessionId/connect
     * Start the Baileys socket for an existing account (shows QR for scan).
     */
    fastify.post('/sessions/:sessionId/connect', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const { sessionId } = req.params as { sessionId: string };

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, sessionId).catch((_) => null));

        if (!account) {
            return reply.sendError({ message: 'Session not found.', code: 'NOT_FOUND' }, 404);
        }

        // Fire and forget — socket boots async
        waManager.connect(sessionId, ctx.workspaceId).catch((err) => {
            fastify.log.error({ err, sessionId }, 'Failed to connect session');
        });

        return reply.sendSuccess({ message: 'Connection initialization started.' }, 202);
    });

    /**
     * GET /sessions/:sessionId/status
     * Poll for current status + QR code for a single session.
     */
    fastify.get('/sessions/:sessionId/status', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const { sessionId } = req.params as { sessionId: string };

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, sessionId).catch((_) => null));

        if (!account) {
            return reply.sendError({ message: 'Session not found.', code: 'NOT_FOUND' }, 404);
        }

        const socket = waManager.getSocket(sessionId);
        const qrCode = waManager.getQrCode(sessionId);
        const creds = (socket?.authState as any)?.creds?.me;
        const isConnected = !!creds;

        let status = account.status;
        if (socket && qrCode) status = 'QR_PENDING';
        else if (isConnected) status = 'CONNECTED';
        else if (socket) status = 'CONNECTING';

        return reply.sendSuccess({
            sessionId,
            name: account.name,
            phoneNumber: account.phoneNumber,
            status,
            qrCode: qrCode || null,
            user: isConnected ? creds : null,
        });
    });

    /**
     * POST /sessions/:sessionId/disconnect
     * Gracefully disconnect a session but keep the account record.
     */
    fastify.post('/sessions/:sessionId/disconnect', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const { sessionId } = req.params as { sessionId: string };

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, sessionId).catch((_) => null));

        if (!account) {
            return reply.sendError({ message: 'Session not found.', code: 'NOT_FOUND' }, 404);
        }

        await waManager.disconnect(sessionId);

        return reply.sendSuccess({ message: 'Disconnected.' });
    });

    /**
     * POST /sessions/:sessionId/resync
     * Gracefully disconnect and reconnect a session to force pulling offline messages.
     * Body: { clearHistory?: boolean }
     *   — when clearHistory=true, wipes all messages/conversations for the session
     *     so WhatsApp re-delivers history on reconnect. Auth keys are PRESERVED so
     *     no QR scan is required.
     */
    fastify.post('/sessions/:sessionId/resync', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const { sessionId } = req.params as { sessionId: string };
        const { clearHistory = false } = (req.body as { clearHistory?: boolean }) ?? {};

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, sessionId).catch((_) => null));

        if (!account) {
            return reply.sendError({ message: 'Session not found.', code: 'NOT_FOUND' }, 404);
        }

        // Disconnect active socket first WITHOUT logging out
        await waManager.disconnect(sessionId, false);

        if (clearHistory) {
            fastify.log.info({ sessionId }, 'Soft-deleting chat history for fresh resync...');
            const deletedAt = new Date();

            // Soft-delete all messages for conversations in this session.
            // Rows are timestamped (deletedAt) and hidden from all queries but preserved for audit.
            // A scheduled cleanup job should hard-purge rows older than 90 days.
            await prisma.message.updateMany({
                where: {
                    conversation: {
                        workspaceId: ctx.workspaceId,
                        provider: 'WHATSAPP',
                        OR: [{ sessionId }, { sessionId: null }],
                    },
                },
                data: { deletedAt },
            });

            // Soft-delete the conversation records themselves
            await prisma.conversation.updateMany({
                where: {
                    workspaceId: ctx.workspaceId,
                    provider: 'WHATSAPP',
                    OR: [{ sessionId }, { sessionId: null }],
                },
                data: { deletedAt },
            });

            fastify.log.info({ sessionId }, 'History soft-deleted — will trigger on-demand resync after reconnect.');
        }

        // Fire and forget reconnect
        waManager.connect(sessionId, ctx.workspaceId).catch((err) => {
            fastify.log.error({ err, sessionId }, 'Failed to reconnect session during resync');
        });

        if (clearHistory) {
            // After the socket reconnects, trigger an on-demand app-state resync.
            // sock.resyncAppState() signals WhatsApp that our local state is stale,
            // causing it to re-deliver the full chat list via messaging-history.set.
            // Wait 12s for the socket to fully establish before calling it.
            setTimeout(async () => {
                const ok = await waManager.requestHistorySync(sessionId);
                fastify.log.info({ sessionId, ok }, 'Post-flush history resync triggered');
            }, 12_000);
        }

        return reply.sendSuccess({
            message: clearHistory ? 'History cleared. Re-fetching from WhatsApp...' : 'Resync connection started.'
        }, 202);
    });

    /**
     * POST /sessions/:sessionId/refresh-contacts
     * Walk through all conversations for this session and backfill missing contact names
     * by reading them from the live socket's in-memory contacts store.
     */
    fastify.post('/sessions/:sessionId/refresh-contacts', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const { sessionId } = req.params as { sessionId: string };

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, sessionId).catch((_) => null));
        if (!account) {
            return reply.sendError({ message: 'Session not found.', code: 'NOT_FOUND' }, 404);
        }

        if (!waManager.getSocket(sessionId)) {
            return reply.sendError({ message: 'Session not currently connected.', code: 'BAD_REQUEST' }, 400);
        }

        // Read from our own contacts store (populated on contacts.upsert + messaging-history.set)
        const contactsMap = waManager.getContactsStore(sessionId);

        let namesFixed = 0;
        let lidsMigrated = 0;

        // ── 1. Backfill missing names ────────────────────────────
        const emptyConvs = await (prisma.conversation as any).findMany({
            where: { workspaceId: ctx.workspaceId, sessionId, waContactName: null, provider: 'WHATSAPP' },
            select: { id: true, providerId: true },
        });

        for (const conv of emptyConvs) {
            const entry = contactsMap.get(conv.providerId);
            if (!entry?.name) continue;
            await (prisma.conversation as any).update({ where: { id: conv.id }, data: { waContactName: entry.name } });
            namesFixed++;
        }

        // ── 2. Migrate LID conversations → real phone JIDs ───────
        const lidConvs = await (prisma.conversation as any).findMany({
            where: { workspaceId: ctx.workspaceId, sessionId, provider: 'WHATSAPP', providerId: { endsWith: '@lid' } },
            select: { id: true, providerId: true },
        });

        for (const conv of lidConvs) {
            const resolved = contactsMap.get(conv.providerId);
            if (!resolved || resolved.jid.endsWith('@lid')) continue;

            // Check if real JID conversation already exists (avoid unique constraint violation)
            const existing = await (prisma.conversation as any).findFirst({
                where: { workspaceId: ctx.workspaceId, providerId: resolved.jid },
                select: { id: true },
            });

            if (!existing) {
                await (prisma.conversation as any).update({
                    where: { id: conv.id },
                    data: { providerId: resolved.jid, waContactName: resolved.name },
                });
                lidsMigrated++;
            }
        }

        return reply.sendSuccess({
            message: `Names refreshed: ${namesFixed}, LIDs migrated to real phones: ${lidsMigrated}`
        });
    });


    /**
     * DELETE /sessions/:sessionId
     * Fully remove an account — disconnect, wipe Baileys keys, delete DB record.
     */
    fastify.delete('/sessions/:sessionId', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const { sessionId } = req.params as { sessionId: string };

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, sessionId).catch((_) => null));

        if (!account) {
            return reply.sendError({ message: 'Session not found.', code: 'NOT_FOUND' }, 404);
        }

        fastify.log.info({ sessionId }, 'Removing account — cascading delete of conversations and messages...');

        // Cascade: delete messages → conversations → baileys auth → account record
        await prisma.message.deleteMany({
            where: { conversation: { sessionId, workspaceId: ctx.workspaceId } },
        });
        await prisma.conversation.deleteMany({
            where: { sessionId, workspaceId: ctx.workspaceId },
        });

        await waManager.deleteAccount(sessionId);
        await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.softDelete(ctx, account.id));

        return reply.sendSuccess({ message: 'Account and all associated conversations removed.' });
    });

    /**
     * GET /sessions/:sessionId/antiban
     * Returns live AntiBan health stats for a session:
     *   health.risk: 'low' | 'medium' | 'high' | 'critical'
     *   rateLimiter: { sentToday, sentThisHour, sentThisMinute, dailyLimit }
     *   warmUp: { day, dailyLimit, isWarmingUp }
     */
    fastify.get('/sessions/:sessionId/antiban', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const { sessionId } = req.params as { sessionId: string };

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, sessionId).catch((_) => null));

        if (!account) {
            return reply.sendError({ message: 'Session not found.', code: 'NOT_FOUND' }, 404);
        }

        const stats = getAntibanStats(sessionId);

        return reply.sendSuccess({ sessionId, ...stats });
    });

    /**
     * PATCH /sessions/:sessionId/knowledge-bot
     * Toggle Product Knowledge Bot listening state safely against active WhatsApp accounts.
     */
    fastify.patch('/sessions/:sessionId/knowledge-bot', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const { sessionId } = req.params as { sessionId: string };
        const { isKnowledgeBot } = req.body as { isKnowledgeBot: boolean };

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, sessionId).catch((_) => null));

        if (!account) {
            return reply.sendError({ message: 'WhatsApp connection not found tightly mapped to this workspace.', code: 'NOT_FOUND' }, 404);
        }

        const updated = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.update(ctx, account.id, {
            botMode: isKnowledgeBot ? 'INTERNAL' : null
        }));

        return reply.sendSuccess(updated);
    });

    /**
     * PATCH /sessions/:sessionId
     * Update a WhatsApp account's details (e.g. name).
     */
    fastify.patch('/sessions/:sessionId', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const { sessionId } = req.params as { sessionId: string };
        const { name } = req.body as { name?: string };

        if (!name || name.trim().length < 1) {
            return reply.sendError({ message: 'Account name is required.', code: 'BAD_REQUEST' }, 400);
        }

        const account = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, sessionId).catch((_) => null));

        if (!account) {
            return reply.sendError({ message: 'Session not found.', code: 'NOT_FOUND' }, 404);
        }

        const updated = await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.update(ctx, account.id, {
            name: name.trim()
        }));

        return reply.sendSuccess(updated);
    });

    // ── Legacy single-session compat endpoints (kept to avoid breaking existing flows) ──

    /** @deprecated Use GET /sessions */
    fastify.get('/status', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const sessions = await waManager.getSessions(ctx);
        const first = sessions[0];
        return reply.sendSuccess({
            status: first?.status || 'DISCONNECTED',
            qrCode: first?.qrCode || null,
            user: null,
        });
    });

    /** @deprecated Use POST /sessions + POST /sessions/:id/connect */
    fastify.post('/connect', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const sessionId = randomUUID();
        await import('../../core/database/repositories/WhatsAppAccountRepository').then(m => m.WhatsAppAccountRepository.create(ctx, { 
            sessionId, name: 'Default Account', status: 'DISCONNECTED', label: null, phoneNumber: null, botMode: null, lastActiveAt: null 
        }));
        waManager.connect(sessionId, ctx.workspaceId).catch(() => {/*ignore*/ });
        return reply.sendSuccess({ message: 'Connection initialization started.' }, 202);
    });

    /** @deprecated Use POST /sessions/:id/disconnect */
    fastify.post('/disconnect', async (req, reply) => {
        const ctx = {
            userId: req.user.sub,
            workspaceId: req.user.workspaceId,
            role: req.user.role as import('@prisma/client').UserRole,
        };
        const sessions = await waManager.getSessions(ctx);
        if (sessions[0]) await waManager.disconnect(sessions[0].sessionId);
        return reply.sendSuccess({ message: 'Disconnect signal sent.' });
    });

    // ── Session Transfer ──────────────────────────────────────────────────────
    /**
     * POST /sessions/:sessionId/transfer
     * OWNER-only. Transfers ownership of a WhatsApp session to another workspace member.
     *
     * Body: { targetUserId: string }
     *
     * Rules:
     *   - Target user MUST be an active member of the same workspace
     *   - The socket is NOT disconnected — session continues running seamlessly
     *   - previousOwnerIds is updated (append current userId) for full audit trail
     *   - Emits session_reassigned audit event
     */
    fastify.post('/sessions/:sessionId/transfer', {
        preHandler: requireRole('members:manage'), // OWNER and ADMIN only
    }, async (req, reply) => {
        const { workspaceId, sub: actorId } = req.user;
        const { sessionId } = req.params as { sessionId: string };
        const { targetUserId } = req.body as { targetUserId?: string };

        if (!targetUserId) {
            return reply.sendError({ message: 'targetUserId is required.', code: 'BAD_REQUEST' }, 400);
        }

        // 1. Fetch the session — enforce workspace isolation
        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId, deletedAt: null },
            select: { id: true, userId: true, previousOwnerIds: true },
        });

        if (!account) {
            return reply.sendError({ message: 'Session not found.', code: 'NOT_FOUND' }, 404);
        }

        // ── Handle unassign (special sentinel value) ────────────────────────
        if (targetUserId === '__unassign__') {
            const previousOwners: string[] = Array.isArray(account.previousOwnerIds)
                ? account.previousOwnerIds as string[]
                : [];
            if (account.userId && !previousOwners.includes(account.userId)) {
                previousOwners.push(account.userId);
            }
            await prisma.whatsAppAccount.update({
                where: { id: account.id },
                data: { userId: null, previousOwnerIds: previousOwners },
            });
            logEvent(workspaceId, 'session_unassigned', 'whatsapp_sessions', {
                sessionId, previousOwnerId: account.userId, removedBy: actorId,
            });
            return reply.sendSuccess({ message: 'Session unassigned.', sessionId });
        }
        // ────────────────────────────────────────────────────────────────────

        // 2. Validate target user is a member of this workspace
        const targetMember = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
            select: { userId: true, role: true },
        });

        if (!targetMember) {
            return reply.sendError({
                message: 'Target user is not a member of this workspace.',
                code: 'NOT_FOUND',
            }, 404);
        }

        // 3. Build updated previousOwnerIds — append current owner (if set) without duplicates
        const previousOwners: string[] = Array.isArray(account.previousOwnerIds)
            ? account.previousOwnerIds as string[]
            : [];

        if (account.userId && !previousOwners.includes(account.userId)) {
            previousOwners.push(account.userId);
        }

        // 4. Update ownership — DO NOT touch socket or status
        await prisma.whatsAppAccount.update({
            where: { id: account.id },
            data: {
                userId: targetUserId,
                previousOwnerIds: previousOwners,
                reauthRequiredAt: null,
            },
        });

        // 5. Audit log (non-blocking)
        logEvent(workspaceId, 'session_reassigned', 'whatsapp_sessions', {
            sessionId,
            previousOwnerId: account.userId,
            newOwnerId: targetUserId,
            transferredBy: actorId,
        });

        return reply.sendSuccess({
            message: 'Session ownership transferred successfully.',
            sessionId,
            previousOwnerId: account.userId,
            newOwnerId: targetUserId,
        });
    });
};

