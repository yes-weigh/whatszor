import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { waManager } from './whatsapp.service';
import { prisma } from '../../prisma/client';
import { randomUUID } from 'crypto';
import { getAntibanStats } from '../../core/antiban';

import { requireActiveWorkspace } from '../../middleware/requireActiveWorkspace';

export const whatsappRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', requireActiveWorkspace);

    /**
     * GET /sessions
     * List all WhatsApp accounts for this workspace with live socket status.
     */
    fastify.get('/sessions', async (req, reply) => {
        const { workspaceId } = req.user;
        const sessions = await waManager.getSessions(workspaceId);
        return reply.send({ success: true, data: sessions });
    });

    /**
     * POST /sessions
     * Create a new named WhatsApp account placeholder (before scanning QR).
     * Body: { name: string }
     */
    fastify.post('/sessions', async (req, reply) => {
        const { workspaceId } = req.user;
        const { name } = req.body as { name?: string };

        if (!name || name.trim().length < 1) {
            return reply.status(400).send({ success: false, message: 'Account name is required.' });
        }

        const sessionId = randomUUID();

        const account = await prisma.whatsAppAccount.create({
            data: {
                workspaceId,
                sessionId,
                name: name.trim(),
                status: 'DISCONNECTED',
            },
        });

        return reply.status(201).send({ success: true, data: account });
    });

    /**
     * POST /sessions/:sessionId/connect
     * Start the Baileys socket for an existing account (shows QR for scan).
     */
    fastify.post('/sessions/:sessionId/connect', async (req, reply) => {
        const { workspaceId } = req.user;
        const { sessionId } = req.params as { sessionId: string };

        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId },
        });

        if (!account) {
            return reply.status(404).send({ success: false, message: 'Session not found.' });
        }

        // Fire and forget — socket boots async
        waManager.connect(sessionId, workspaceId).catch((err) => {
            fastify.log.error({ err, sessionId }, 'Failed to connect session');
        });

        return reply.status(202).send({ success: true, data: { message: 'Connection initialization started.' } });
    });

    /**
     * GET /sessions/:sessionId/status
     * Poll for current status + QR code for a single session.
     */
    fastify.get('/sessions/:sessionId/status', async (req, reply) => {
        const { workspaceId } = req.user;
        const { sessionId } = req.params as { sessionId: string };

        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId },
        });

        if (!account) {
            return reply.status(404).send({ success: false, message: 'Session not found.' });
        }

        const socket = waManager.getSocket(sessionId);
        const qrCode = waManager.getQrCode(sessionId);
        const creds = (socket?.authState as any)?.creds?.me;
        const isConnected = !!creds;

        let status = account.status;
        if (socket && qrCode) status = 'NEEDS_SCAN';
        else if (isConnected) status = 'CONNECTED';
        else if (socket) status = 'CONNECTING';

        return reply.send({
            success: true,
            data: {
                sessionId,
                name: account.name,
                phoneNumber: account.phoneNumber,
                status,
                qrCode: qrCode || null,
                user: isConnected ? creds : null,
            },
        });
    });

    /**
     * POST /sessions/:sessionId/disconnect
     * Gracefully disconnect a session but keep the account record.
     */
    fastify.post('/sessions/:sessionId/disconnect', async (req, reply) => {
        const { workspaceId } = req.user;
        const { sessionId } = req.params as { sessionId: string };

        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId },
        });

        if (!account) {
            return reply.status(404).send({ success: false, message: 'Session not found.' });
        }

        await waManager.disconnect(sessionId);

        return reply.send({ success: true, data: { message: 'Disconnected.' } });
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
        const { workspaceId } = req.user;
        const { sessionId } = req.params as { sessionId: string };
        const { clearHistory = false } = (req.body as { clearHistory?: boolean }) ?? {};

        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId },
        });

        if (!account) {
            return reply.status(404).send({ success: false, message: 'Session not found.' });
        }

        // Disconnect active socket first WITHOUT logging out
        await waManager.disconnect(sessionId, false);

        if (clearHistory) {
            fastify.log.info({ sessionId }, 'Clearing chat history for fresh resync...');

            // Delete all messages for conversations in this session
            // Also include conversations with sessionId=null (created before session tracking)
            await prisma.message.deleteMany({
                where: {
                    conversation: {
                        workspaceId,
                        provider: 'WHATSAPP',
                        OR: [{ sessionId }, { sessionId: null }],
                    },
                },
            });

            // Delete all conversations (sessionId match or null = pre-session-tracking rows)
            await prisma.conversation.deleteMany({
                where: {
                    workspaceId,
                    provider: 'WHATSAPP',
                    OR: [{ sessionId }, { sessionId: null }],
                },
            });

            fastify.log.info({ sessionId }, 'History cleared. Pending fresh reconnect...');
        }

        // Fire and forget reconnect
        waManager.connect(sessionId, workspaceId).catch((err) => {
            fastify.log.error({ err, sessionId }, 'Failed to reconnect session during resync');
        });

        return reply.status(202).send({
            success: true,
            data: { message: clearHistory ? 'History cleared. Fresh sync started.' : 'Resync connection started.' },
        });
    });

    /**
     * POST /sessions/:sessionId/refresh-contacts
     * Walk through all conversations for this session and backfill missing contact names
     * by reading them from the live socket's in-memory contacts store.
     */
    fastify.post('/sessions/:sessionId/refresh-contacts', async (req, reply) => {
        const { workspaceId } = req.user;
        const { sessionId } = req.params as { sessionId: string };

        if (!waManager.getSocket(sessionId)) {
            return reply.status(400).send({ success: false, message: 'Session not currently connected.' });
        }

        // Read from our own contacts store (populated on contacts.upsert + messaging-history.set)
        const contactsMap = waManager.getContactsStore(sessionId);

        let namesFixed = 0;
        let lidsMigrated = 0;

        // ── 1. Backfill missing names ────────────────────────────
        const emptyConvs = await (prisma.conversation as any).findMany({
            where: { workspaceId, sessionId, waContactName: null, provider: 'WHATSAPP' },
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
            where: { workspaceId, sessionId, provider: 'WHATSAPP', providerId: { endsWith: '@lid' } },
            select: { id: true, providerId: true },
        });

        for (const conv of lidConvs) {
            const resolved = contactsMap.get(conv.providerId);
            if (!resolved || resolved.jid.endsWith('@lid')) continue;

            // Check if real JID conversation already exists (avoid unique constraint violation)
            const existing = await (prisma.conversation as any).findFirst({
                where: { workspaceId, providerId: resolved.jid },
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

        return reply.send({
            success: true,
            data: { message: `Names refreshed: ${namesFixed}, LIDs migrated to real phones: ${lidsMigrated}` },
        });
    });


    /**
     * DELETE /sessions/:sessionId
     * Fully remove an account — disconnect, wipe Baileys keys, delete DB record.
     */
    fastify.delete('/sessions/:sessionId', async (req, reply) => {
        const { workspaceId } = req.user;
        const { sessionId } = req.params as { sessionId: string };

        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId },
        });

        if (!account) {
            return reply.status(404).send({ success: false, message: 'Session not found.' });
        }

        fastify.log.info({ sessionId }, 'Removing account — cascading delete of conversations and messages...');

        // Cascade: delete messages → conversations → baileys auth → account record
        await prisma.message.deleteMany({
            where: { conversation: { sessionId, workspaceId } },
        });
        await prisma.conversation.deleteMany({
            where: { sessionId, workspaceId },
        });

        await waManager.deleteAccount(sessionId);

        return reply.send({ success: true, data: { message: 'Account and all associated conversations removed.' } });
    });

    /**
     * GET /sessions/:sessionId/antiban
     * Returns live AntiBan health stats for a session:
     *   health.risk: 'low' | 'medium' | 'high' | 'critical'
     *   rateLimiter: { sentToday, sentThisHour, sentThisMinute, dailyLimit }
     *   warmUp: { day, dailyLimit, isWarmingUp }
     */
    fastify.get('/sessions/:sessionId/antiban', async (req, reply) => {
        const { workspaceId } = req.user;
        const { sessionId } = req.params as { sessionId: string };

        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId },
        });

        if (!account) {
            return reply.status(404).send({ success: false, message: 'Session not found.' });
        }

        const stats = getAntibanStats(sessionId);

        if (!stats) {
            return reply.send({
                success: true,
                data: {
                    sessionId,
                    status: 'not_initialised',
                    message: 'Session has not been connected yet — no AntiBan instance exists.',
                },
            });
        }

        return reply.send({ success: true, data: { sessionId, ...stats } });
    });

    /**
     * PATCH /sessions/:sessionId/knowledge-bot
     * Toggle Product Knowledge Bot listening state safely against active WhatsApp accounts.
     */
    fastify.patch('/sessions/:sessionId/knowledge-bot', async (req, reply) => {
        const { workspaceId } = req.user;
        const { sessionId } = req.params as { sessionId: string };
        const { isKnowledgeBot } = req.body as { isKnowledgeBot: boolean };

        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId },
        });

        if (!account) {
            return reply.status(404).send({ success: false, message: 'WhatsApp connection not found tightly mapped to this workspace.' });
        }

        const updated = await prisma.whatsAppAccount.update({
            where: { id: account.id },
            data: { isKnowledgeBot }
        });

        return reply.send({ success: true, data: updated });
    });

    /**
     * PATCH /sessions/:sessionId
     * Update a WhatsApp account's details (e.g. name).
     */
    fastify.patch('/sessions/:sessionId', async (req, reply) => {
        const { workspaceId } = req.user;
        const { sessionId } = req.params as { sessionId: string };
        const { name } = req.body as { name?: string };

        if (!name || name.trim().length < 1) {
            return reply.status(400).send({ success: false, message: 'Account name is required.' });
        }

        const account = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId },
        });

        if (!account) {
            return reply.status(404).send({ success: false, message: 'Session not found.' });
        }

        const updated = await prisma.whatsAppAccount.update({
            where: { id: account.id },
            data: { name: name.trim() },
        });

        return reply.send({ success: true, data: updated });
    });

    // ── Legacy single-session compat endpoints (kept to avoid breaking existing flows) ──

    /** @deprecated Use GET /sessions */
    fastify.get('/status', async (req, reply) => {
        const { workspaceId } = req.user;
        const sessions = await waManager.getSessions(workspaceId);
        const first = sessions[0];
        return reply.send({
            success: true,
            data: {
                status: first?.status || 'DISCONNECTED',
                qrCode: first?.qrCode || null,
                user: null,
            },
        });
    });

    /** @deprecated Use POST /sessions + POST /sessions/:id/connect */
    fastify.post('/connect', async (req, reply) => {
        const { workspaceId } = req.user;
        const sessionId = randomUUID();
        await prisma.whatsAppAccount.create({
            data: { workspaceId, sessionId, name: 'Default Account', status: 'DISCONNECTED' },
        });
        waManager.connect(sessionId, workspaceId).catch(() => {/*ignore*/ });
        return reply.status(202).send({ success: true, data: { message: 'Connection initialization started.' } });
    });

    /** @deprecated Use POST /sessions/:id/disconnect */
    fastify.post('/disconnect', async (req, reply) => {
        const { workspaceId } = req.user;
        const sessions = await waManager.getSessions(workspaceId);
        if (sessions[0]) await waManager.disconnect(sessions[0].sessionId);
        return reply.send({ success: true, data: { message: 'Disconnect signal sent.' } });
    });
};
