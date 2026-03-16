import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AdminLoginSchema } from '@whatszor/shared';
import { loginAdmin, getWorkspaces, toggleWorkspaceStatus } from './admin.service';
import { authenticateAdmin } from '../../middleware/authenticateAdmin';

export const adminRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    /**
     * POST /api/v1/admin/auth/login
     * Login for GlobalUsers (Super Admins and Staff)
     */
    fastify.post('/auth/login', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: (req: any) => `admin-login:${req.ip}` } },
    }, async (req, reply) => {
        const body = AdminLoginSchema.parse(req.body);
        const tokens = await loginAdmin(body);
        return reply.status(200).send({ success: true, data: tokens });
    });

    /**
     * GET /api/v1/admin/workspaces
     * List all dealer workspaces
     */
    fastify.get('/workspaces', { preHandler: authenticateAdmin }, async (_req, reply) => {
        const workspaces = await getWorkspaces();
        return reply.status(200).send({ success: true, data: workspaces });
    });

    /**
     * POST /api/v1/admin/workspaces/:id/suspend
     * Suspend a dealer workspace
     */
    fastify.post('/workspaces/:id/suspend', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        const schema = z.object({ suspend: z.boolean() });
        const { suspend } = schema.parse(req.body);
        
        try {
            const workspace = await toggleWorkspaceStatus(req.params.id, suspend);
            return reply.status(200).send({ success: true, data: workspace });
        } catch (error: any) {
            return reply.status(400).send({ success: false, message: error.message });
        }
    });
};
