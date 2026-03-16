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
        const { jid } = req.query as { jid?: string };
        if (!jid) return reply.status(400).send({ success: false, message: 'jid required' });

        try {
            // Find any connected account for this workspace
            const account = await prisma.whatsAppAccount.findFirst({
                where: { workspaceId: req.user.workspaceId, status: 'CONNECTED' },
                select: { sessionId: true }
            });
            if (!account) return reply.send({ success: true, data: null });

            const sock = waManager.getSocket(account.sessionId);
            if (!sock) return reply.send({ success: true, data: null });

            const url = await sock.profilePictureUrl(jid, 'image').catch(() => null);
            return reply.send({ success: true, data: url });
        } catch {
            return reply.send({ success: true, data: null });
        }
    });

    // ── Conversation Thread Management ──

    fastify.post('/', { preHandler: requireRole('conversations:reply') }, async (req, reply) => {
        const input = CreateConversationSchema.parse(req.body);
        const conv = await conversationService.createOrGetConversation(req.user.workspaceId, input);
        return reply.status(200).send({ success: true, data: conv });
    });

    fastify.get('/', async (req, reply) => {
        const { sessionId } = req.query as { sessionId?: string };
        const result = await conversationService.listConversations(req.user.workspaceId, sessionId);
        return reply.send({ success: true, data: result });
    });

    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const conv = await conversationService.getConversation(req.user.workspaceId, id);
        return reply.send({ success: true, data: conv });
    });

    fastify.patch('/:id', { preHandler: requireRole('conversations:reply') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = UpdateConversationSchema.parse(req.body);
        const conv = await conversationService.updateConversation(req.user.workspaceId, id, input);
        return reply.send({ success: true, data: conv });
    });

    // ── Messages within a Conversation ──

    fastify.get('/:id/messages', async (req, reply) => {
        const { id } = req.params as { id: string };
        const messages = await conversationService.getMessages(req.user.workspaceId, id);
        return reply.send({ success: true, data: messages });
    });

    fastify.post('/:id/messages', { preHandler: requireRole('conversations:reply') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = SendMessageSchema.parse(req.body);
        const message = await conversationService.sendMessage(req.user.workspaceId, req.user.sub, id, input);
        return reply.status(201).send({ success: true, data: message });
    });
};
