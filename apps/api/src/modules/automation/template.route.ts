import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as templateService from './template.service';

export const templateRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // List all templates (public: no auth needed, helps onboarding)
    fastify.get('/', async (req, reply) => {
        const { category } = req.query as { category?: string };
        const data = await templateService.listTemplates(category);
        return reply.sendSuccess(data);
    });

    // Get single template
    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const data = await templateService.getTemplate(id);
        return reply.sendSuccess(data);
    });

    // Install template — requires auth to know the workspace
    fastify.post('/:id/install', { preHandler: [authenticate, requireRole('automation:create')] }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const data = await templateService.installTemplate(workspaceId, id);
        return reply.code(201).sendSuccess(data);
    });
};
