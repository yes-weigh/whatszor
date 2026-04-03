import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as insightService from './automation-insights.service';

export const automationInsightRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    // List pending insights
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const { status = 'pending' } = req.query as { status?: string };
        const data = await insightService.getInsights(workspaceId, status);
        return reply.sendSuccess(data);
    });

    // Trigger a manual on-demand scan for this workspace
    fastify.post('/scan', async (req, reply) => {
        const { workspaceId } = req.user;
        const result = await insightService.scanWorkspaceForInsights(workspaceId);
        return reply.sendSuccess(result);
    });

    // Accept insight → creates KeywordAutomation
    fastify.post('/:id/accept', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const automation = await insightService.acceptInsight(workspaceId, id);
        return reply.code(201).sendSuccess(automation);
    });

    // Dismiss insight
    fastify.post('/:id/dismiss', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        await insightService.dismissInsight(workspaceId, id);
        return reply.sendSuccess(null);
    });
};
