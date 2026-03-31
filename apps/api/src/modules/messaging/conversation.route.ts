import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateConversationSchema, UpdateConversationSchema, SendMessageSchema } from '@whatszor/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as conversationService from './conversation.service';
import { waManager } from '../whatsapp/whatsapp.service';
import { prisma } from '../../prisma/client';

import { requireActiveWorkspace } from '../../middleware/requireActiveWorkspace';

export const conversationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', requireActiveWorkspace);

    // ── Profile Picture (proxy via Baileys) ──
    // Must be before /:id to avoid route conflict
    fastify.get('/profile-picture', async (req, reply) => {
        const { jid, sessionId } = req.query as { jid?: string, sessionId?: string };
        if (!jid) return reply.code(400).sendError({ code: 'BAD_REQUEST', message: 'jid required' });

        try {
            let targetSessionId = sessionId;

            if (!targetSessionId) {
                // Find any connected account for this workspace as fallback
                const account = await prisma.whatsAppAccount.findFirst({
                    where: { workspaceId: req.user.workspaceId, status: 'CONNECTED' },
                    select: { sessionId: true }
                });
                if (!account) return reply.sendSuccess(null);
                targetSessionId = account.sessionId;
            }

            const sock = waManager.getSocket(targetSessionId);
            if (!sock) return reply.send({ success: true, data: null });

            const url = await sock.profilePictureUrl(jid, 'image').catch(() => null);
            return reply.sendSuccess(url);
        } catch {
            return reply.sendSuccess(null);
        }
    });

    // ── Conversation Thread Management ──

    fastify.post('/', { preHandler: requireRole('conversations:reply') }, async (req, reply) => {
        const input = CreateConversationSchema.parse(req.body);
        const conv = await conversationService.createOrGetConversation(req.user.workspaceId, input);
        return reply.sendSuccess(conv);
    });

    fastify.get('/', async (req, reply) => {
        const { sessionId } = req.query as { sessionId?: string };
        const result = await conversationService.listConversations(req.user.workspaceId, sessionId);
        return reply.sendSuccess(result);
    });

    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const conv = await conversationService.getConversation(req.user.workspaceId, id);
        return reply.sendSuccess(conv);
    });

    fastify.patch('/:id', { preHandler: requireRole('conversations:reply') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = UpdateConversationSchema.parse(req.body);
        const conv = await conversationService.updateConversation(req.user.workspaceId, id, input);
        return reply.sendSuccess(conv);
    });

    // ── Messages within a Conversation ──

    fastify.get('/:id/messages', async (req, reply) => {
        const { id } = req.params as { id: string };
        const { cursor } = req.query as { cursor?: string };
        const messages = await conversationService.getMessages(req.user.workspaceId, id, cursor);
        return reply.sendSuccess(messages);
    });

    fastify.post('/:id/messages', { config: { rateLimit: { max: 100, timeWindow: '1 minute' } }, preHandler: requireRole('conversations:reply') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = SendMessageSchema.parse(req.body);
        const message = await conversationService.sendMessage(
            req.user.workspaceId,
            req.user.sub,
            req.user.role,   // ← passed for MEMBER session ownership guard
            id,
            input,
        );
        return reply.sendSuccess(message, 201);
    });

    fastify.post('/messages/:messageId/approve', { preHandler: requireRole('conversations:reply') }, async (req, reply) => {
        const { messageId } = req.params as { messageId: string };
        const { sessionId } = req.body as { sessionId?: string };
        const message = await conversationService.approveMessage(req.user.workspaceId, messageId, sessionId);
        return reply.sendSuccess(message);
    });

    fastify.post('/:id/suggest-reply', { preHandler: requireRole('conversations:reply') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const data = await conversationService.generateSuggestedReply(req.user.workspaceId, id);
        return reply.sendSuccess(data);
    });

    /**
     * GET /conversations/:id/sync
     *
     * SSE Recovery Endpoint — called by the frontend immediately after an SSE
     * reconnect to refetch the latest conversation state without replaying events.
     *
     * Returns:
     *   - Full conversation record
     *   - Last 20 messages (most recent first, for display)
     *
     * The client should merge this response into its local state to handle
     * any updates missed during the disconnection window.
     */
    fastify.get('/:id/sync', async (req, reply) => {
        const { id } = req.params as { id: string };
        const workspaceId = req.user.workspaceId;

        const conversation = await conversationService.getConversation(workspaceId, id);

        const allMessages = await conversationService.getMessages(workspaceId, id);

        // For SSE recovery we only need the most-recent 20 messages —
        // enough to reconstruct visible UI state without fetching the full history.
        const recentMessages = allMessages.items.slice(-20);

        return reply.sendSuccess({
            conversation,
            messages: recentMessages,
            syncedAt: new Date().toISOString(),
        });
    });
};
