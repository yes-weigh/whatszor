import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generateLicenseKeys, getLicenseKeys, redeemLicenseKey } from './license.service';
import { authenticateAdmin } from '../../middleware/authenticateAdmin';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import { invalidateWorkspaceCache } from '../../middleware/requireActiveWorkspace';

const GenerateKeySchema = z.object({
    planTier: z.enum(['FREE', 'STARTER', 'PRO', 'AGENCY']),
    durationDays: z.number().int().positive(),
    count: z.number().int().positive().max(100).default(1),
});

export const licenseRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    
    /**
     * POST /api/v1/licenses/generate
     * Admin endpoint to generate new license keys
     */
    fastify.post('/generate', { preHandler: authenticateAdmin }, async (req, reply) => {
        const { planTier, durationDays, count } = GenerateKeySchema.parse(req.body);
        const adminId = req.user.sub;
        
        const keys = await generateLicenseKeys(adminId, planTier as 'FREE'|'STARTER'|'PRO'|'AGENCY', durationDays, count);
        return reply.status(201).send({ success: true, data: keys });
    });

    /**
     * GET /api/v1/licenses
     * Admin endpoint to list all license keys
     */
    fastify.get('/', { preHandler: authenticateAdmin }, async (_req, reply) => {
        const keys = await getLicenseKeys();
        return reply.status(200).send({ success: true, data: keys });
    });

    /**
     * POST /api/v1/licenses/redeem
     * Workspace OWNER redeems a license key (billing authority is OWNER-only).
     */
    fastify.post('/redeem', { preHandler: [authenticate, requireRole('OWNER')] }, async (req, reply) => {
        const schema = z.object({ key: z.string().min(1) });
        const { key } = schema.parse(req.body);
        const { workspaceId } = req.user;

        try {
            const result = await redeemLicenseKey(workspaceId, key);
            // Purge cache so next API call sees ACTIVE status immediately
            invalidateWorkspaceCache(workspaceId);
            return reply.status(200).send({ success: true, data: result });
        } catch (error: any) {
            return reply.status(400).send({ success: false, message: error.message });
        }
    });
};
