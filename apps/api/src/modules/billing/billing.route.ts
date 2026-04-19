import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { authenticateAdmin } from '../../middleware/authenticateAdmin';
import * as billingService from './billing.service';

export const billingRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    
    // ----------- USER FACING ROUTES -----------
    
    fastify.post('/payment-requests', { preHandler: authenticate }, async (req: any, reply) => {
        const { transactionRef, planTier, durationDays, amountPaid } = req.body;
        const workspaceId = req.user.workspaceId;

        const request = await billingService.createPaymentRequest(workspaceId, transactionRef, planTier, durationDays, amountPaid);
        return reply.status(201).sendSuccess(request);
    });

    fastify.get('/payment-requests', { preHandler: authenticate }, async (req: any, reply) => {
        const workspaceId = req.user.workspaceId;
        const requests = await billingService.getUserPaymentRequests(workspaceId);
        return reply.status(200).sendSuccess(requests);
    });

    fastify.get('/config', { preHandler: authenticate }, async (_req, reply) => {
        const { getAllSystemConfigs } = await import('../admin/config.service');
        const configs = await getAllSystemConfigs();
        
        // Expose only safe variables to the frontend (like UPI settings)
        const safeConfigs = {
            UPI_VPA: configs['UPI_VPA'] || '',
            UPI_MERCHANT_NAME: configs['UPI_MERCHANT_NAME'] || ''
        };
        
        return reply.status(200).sendSuccess(safeConfigs);
    });


    // ----------- ADMIN FACING ROUTES -----------
    
    fastify.get('/admin/payments', { preHandler: authenticateAdmin }, async (_req, reply) => {
        const requests = await billingService.getAdminPaymentRequests();
        return reply.status(200).sendSuccess(requests);
    });

    fastify.post('/admin/payments/:id/process', { preHandler: authenticateAdmin }, async (req: any, reply) => {
        const { id } = req.params;
        const { action } = req.body; // 'APPROVE' | 'REJECT'
        const adminId = req.user.sub;

        if (action !== 'APPROVE' && action !== 'REJECT') {
            return reply.status(400).send({ success: false, error: { message: 'Invalid action' } });
        }

        const request = await billingService.processPaymentRequest(id, action, adminId);
        return reply.status(200).sendSuccess(request);
    });
};
