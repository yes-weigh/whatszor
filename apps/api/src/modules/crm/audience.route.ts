import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import {
    createAudience,
    listAudiences,
    updateAudience,
    deleteAudience,
    addContactsToAudience,
    removeContactFromAudience,
} from './audience.service';

const CreateAudienceSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
});

const UpdateAudienceSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
});

export const audienceRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // All audience routes require authentication
    fastify.addHook('preHandler', authenticate);

    /**
     * GET /api/v1/crm/audiences
     * Returns audiences with pagination
     */
    fastify.get('/audiences', async (req, reply) => {
        const query = req.query as { page?: string; limit?: string };
        const page = parseInt(query.page || '1', 10);
        const limit = parseInt(query.limit || '20', 10);
        
        const data = await listAudiences(req.user.workspaceId, page, limit);
        return reply.send({ success: true, data });
    });

    /**
     * POST /api/v1/crm/audiences
     * Creates an audience. Requires ADMIN or OWNER.
     */
    fastify.post(
        '/audiences',
        { preHandler: requireRole('contacts:manage') as any },
        async (req, reply) => {
            const body = CreateAudienceSchema.parse(req.body);
            const audience = await createAudience(req.user.workspaceId, body);
            return reply.status(201).send({ success: true, data: audience });
        },
    );

    /**
     * PATCH /api/v1/crm/audiences/:id
     * Updates an audience. Requires ADMIN or OWNER.
     */
    fastify.patch(
        '/audiences/:id',
        { preHandler: requireRole('contacts:manage') as any },
        async (req, reply) => {
            const { id } = req.params as { id: string };
            const body = UpdateAudienceSchema.parse(req.body);
            const audience = await updateAudience(req.user.workspaceId, id, body);
            return reply.send({ success: true, data: audience });
        },
    );

    /**
     * DELETE /api/v1/crm/audiences/:id
     * Deletes an audience. Requires OWNER only.
     */
    fastify.delete(
        '/audiences/:id',
        { preHandler: requireRole('OWNER') as any },
        async (req, reply) => {
            const { id } = req.params as { id: string };
            await deleteAudience(req.user.workspaceId, id);
            return reply.send({ success: true, message: 'Audience deleted' });
        },
    );

    /**
     * POST /api/v1/crm/audiences/:id/contacts
     * Adds an array of contact IDs to the audience.
     */
    fastify.post(
        '/audiences/:id/contacts',
        { preHandler: requireRole('contacts:update') as any },
        async (req, reply) => {
            const { id } = req.params as { id: string };
            const { contactIds } = z.object({ contactIds: z.array(z.string()) }).parse(req.body);
            
            const result = await addContactsToAudience(req.user.workspaceId, id, contactIds);
            return reply.send({ success: true, data: result });
        },
    );

    /**
     * DELETE /api/v1/crm/audiences/:id/contacts/:contactId
     * Removes a single contact from the audience.
     */
    fastify.delete(
        '/audiences/:id/contacts/:contactId',
        { preHandler: requireRole('contacts:update') as any },
        async (req, reply) => {
            const { id, contactId } = req.params as { id: string; contactId: string };
            const result = await removeContactFromAudience(req.user.workspaceId, id, contactId);
            return reply.send({ success: true, data: result });
        },
    );
};
