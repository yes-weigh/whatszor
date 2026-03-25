import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateContactSchema, UpdateContactSchema } from '@whatszor/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as contactService from './contact.service';

export const contactRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    fastify.post('/', { preHandler: requireRole('contacts:create') }, async (req, reply) => {
        const input = CreateContactSchema.parse(req.body);
        const contact = await contactService.createContact(req.user.workspaceId, input);
        return reply.status(201).send({ success: true, data: contact });
    });

    fastify.get('/', async (req, reply) => {
        const { search, limit } = (req.query as { search?: string; limit?: string });
        const contacts = await contactService.listContacts(req.user.workspaceId, {
            search: search?.trim() || undefined,
            limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
        });
        return reply.send({ success: true, data: contacts });
    });

    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const contact = await contactService.getContact(req.user.workspaceId, id);
        return reply.send({ success: true, data: contact });
    });

    fastify.patch('/:id', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = UpdateContactSchema.parse(req.body);
        const contact = await contactService.updateContact(req.user.workspaceId, id, input);
        return reply.send({ success: true, data: contact });
    });

    fastify.delete('/:id', { preHandler: requireRole('contacts:delete') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        await contactService.deleteContact(req.user.workspaceId, id);
        return reply.send({ success: true, data: { message: 'Contact deleted' } });
    });

    fastify.delete('/bulk', { preHandler: requireRole('contacts:delete') }, async (req, reply) => {
        // We expect a JSON array of contact IDs in the body, or query param
        const { ids } = req.body as { ids: string[] };
        if (!ids || !Array.isArray(ids)) {
            return reply.status(400).send({ success: false, error: 'Expected an array of contact IDs in the "ids" field' });
        }
        await contactService.deleteManyContacts(req.user.workspaceId, ids);
        return reply.send({ success: true, data: { message: 'Contacts deleted successfully' } });
    });
};
