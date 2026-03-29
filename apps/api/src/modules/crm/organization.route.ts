import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateOrganizationSchema, UpdateOrganizationSchema } from '@whatszor/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as organizationService from './organization.service';

export const organizationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    fastify.post('/', { preHandler: requireRole('contacts:create') }, async (req, reply) => {
        const input = CreateOrganizationSchema.parse(req.body);
        const org = await organizationService.createOrganization(req.user.workspaceId, input);
        return reply.sendSuccess(org, 201);
    });

    fastify.get('/', async (req, reply) => {
        const orgs = await organizationService.listOrganizations(req.user.workspaceId);
        return reply.sendSuccess(orgs);
    });

    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const org = await organizationService.getOrganization(req.user.workspaceId, id);
        return reply.sendSuccess(org);
    });

    fastify.patch('/:id', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = UpdateOrganizationSchema.parse(req.body);
        const org = await organizationService.updateOrganization(req.user.workspaceId, id, input);
        return reply.sendSuccess(org);
    });

    fastify.delete('/:id', { preHandler: requireRole('contacts:delete') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        await organizationService.deleteOrganization(req.user.workspaceId, id);
        return reply.sendSuccess({ message: 'Organization deleted' });
    });
};
