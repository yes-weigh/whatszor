import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateContactSchema, UpdateContactSchema, createError } from '@whatszor/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as contactService from './contact.service';
import * as contactProductService from './contact-product.service';

export const contactRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    fastify.post('/', { preHandler: requireRole('contacts:create') }, async (req, reply) => {
        const input = CreateContactSchema.parse(req.body);
        const contact = await contactService.createContact(req.user.workspaceId, input);
        return reply.sendSuccess(contact, 201);
    });

    fastify.get('/', async (req, reply) => {
        const { search, limit } = (req.query as { search?: string; limit?: string });
        const contacts = await contactService.listContacts(req.user.workspaceId, {
            search: search?.trim() || undefined,
            limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
        });
        return reply.sendSuccess(contacts);
    });

    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const contact = await contactService.getContact(req.user.workspaceId, id);
        return reply.sendSuccess(contact);
    });

    fastify.patch('/:id', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = UpdateContactSchema.parse(req.body);
        const contact = await contactService.updateContact(req.user.workspaceId, id, input);
        return reply.sendSuccess(contact);
    });

    fastify.delete('/:id', { preHandler: requireRole('contacts:delete') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        await contactService.deleteContact(req.user.workspaceId, id);
        return reply.sendSuccess({ message: 'Contact deleted' });
    });

    fastify.delete('/bulk', { preHandler: requireRole('contacts:delete') }, async (req, reply) => {
        // We expect a JSON array of contact IDs in the body, or query param
        const { ids } = req.body as { ids: string[] };
        if (!ids || !Array.isArray(ids)) {
            return reply.sendError({ 
                message: 'Expected an array of contact IDs in the "ids" field',
                code: 'BAD_REQUEST'
            }, 400);
        }
        await contactService.deleteManyContacts(req.user.workspaceId, ids);
        return reply.sendSuccess({ message: 'Contacts deleted successfully' });
    });

    // ── Contact-Product Relationships ─────────────────────────────────────

    fastify.post('/:id/products', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const body = req.body as { productId: string; relationType?: string };
        
        if (!body || !body.productId) {
            return reply.sendError(createError('productId is required', 'BAD_REQUEST', 400), 400);
        }

        const relation = await contactProductService.addProductToContact(
            req.user.workspaceId, 
            id, 
            body.productId, 
            body.relationType
        );
        return reply.sendSuccess(relation, 201);
    });

    fastify.delete('/:id/products/:productId', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { id, productId } = req.params as { id: string; productId: string };
        const { relationType } = req.query as { relationType?: string };
        
        if (!relationType) {
            return reply.sendError(createError('relationType query parameter is required to explicitly define deletion bounds.', 'BAD_REQUEST', 400), 400);
        }

        await contactProductService.removeProductFromContact(req.user.workspaceId, id, productId, relationType);
        return reply.sendSuccess({ message: 'Product removed from contact' });
    });

    fastify.get('/:id/products', async (req, reply) => {
        const { id } = req.params as { id: string };
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        
        const products = await contactProductService.listProductsForContact(
            req.user.workspaceId, 
            id,
            limit ? parseInt(limit, 10) : 50,
            cursor
        );
        return reply.sendSuccess({ items: products.items, nextCursor: products.nextCursor });
    });
};
