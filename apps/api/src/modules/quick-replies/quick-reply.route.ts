import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as quickReplyService from './quick-reply.service';

const CreateQuickReplySchema = z.object({
    shortcut: z.string().min(1).max(50),
    content: z.string().min(1).max(2000),
});

const UpdateQuickReplySchema = CreateQuickReplySchema.partial();

export const quickReplyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    // List Quick Replies
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const data = await quickReplyService.getQuickReplies(workspaceId);
        return reply.send({ success: true, data });
    });

    // Create Quick Reply
    fastify.post('/', { preHandler: requireRole('templates:manage') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const input = CreateQuickReplySchema.parse(req.body);
        const data = await quickReplyService.createQuickReply(workspaceId, input);
        return reply.status(201).send({ success: true, data });
    });

    // Update Quick Reply
    fastify.patch('/:id', { preHandler: requireRole('templates:manage') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = UpdateQuickReplySchema.parse(req.body);
        const data = await quickReplyService.updateQuickReply(workspaceId, id, input);
        return reply.send({ success: true, data });
    });

    // Delete Quick Reply
    fastify.delete('/:id', { preHandler: requireRole('templates:manage') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        await quickReplyService.deleteQuickReply(workspaceId, id);
        return reply.status(204).send();
    });
};
