import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as quickReplyService from './quick-reply.service';

const CreateQuickReplySchema = z.object({
    shortcut: z.string().min(1).max(50),
    content: z.string().min(1).max(2000),
    mediaId: z.string().nullable().optional(),
});
const UpdateQuickReplySchema = CreateQuickReplySchema.partial();

const CreateAutoReplySchema = z.object({
    keyword: z.string().min(1).max(200),
    content: z.string().max(2000).optional().default(''),
    mediaId: z.string().nullable().optional(),
    templateId: z.string().nullable().optional(),
}).refine(
    (d) => !!d.templateId || (d.content && d.content.length > 0),
    { message: 'Either content or a template must be provided', path: ['content'] },
);
const UpdateAutoReplySchema = z.object({
    keyword: z.string().min(1).max(200).optional(),
    content: z.string().max(2000).optional(),
    mediaId: z.string().nullable().optional(),
    templateId: z.string().nullable().optional(),
});

export const quickReplyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    // ── Quick Replies ────────────────────────────────────────────────

    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const data = await quickReplyService.getQuickReplies(workspaceId);
        return reply.send({ success: true, data });
    });

    fastify.post('/', { preHandler: requireRole('templates:manage') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const input = CreateQuickReplySchema.parse(req.body);
        const data = await quickReplyService.createQuickReply(workspaceId, input);
        return reply.status(201).send({ success: true, data });
    });

    fastify.patch('/:id', { preHandler: requireRole('templates:manage') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = UpdateQuickReplySchema.parse(req.body);
        const data = await quickReplyService.updateQuickReply(workspaceId, id, input);
        return reply.send({ success: true, data });
    });

    fastify.delete('/:id', { preHandler: requireRole('templates:manage') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        await quickReplyService.deleteQuickReply(workspaceId, id);
        return reply.status(204).send();
    });

    // ── Auto Replies ─────────────────────────────────────────────────

    fastify.get('/auto', async (req, reply) => {
        const { workspaceId } = req.user;
        const data = await quickReplyService.getAutoReplies(workspaceId);
        return reply.send({ success: true, data });
    });

    fastify.post('/auto', { preHandler: requireRole('templates:manage') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const input = CreateAutoReplySchema.parse(req.body);
        const data = await quickReplyService.createAutoReply(workspaceId, input);
        return reply.status(201).send({ success: true, data });
    });

    fastify.patch('/auto/:id', { preHandler: requireRole('templates:manage') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = UpdateAutoReplySchema.parse(req.body);
        const data = await quickReplyService.updateAutoReply(workspaceId, id, input);
        return reply.send({ success: true, data });
    });

    fastify.delete('/auto/:id', { preHandler: requireRole('templates:manage') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        await quickReplyService.deleteQuickReply(workspaceId, id); // same delete fn works
        return reply.status(204).send();
    });
};
