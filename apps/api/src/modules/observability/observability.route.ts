import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { prisma } from '../../prisma/client';
import { z } from 'zod';

const GetEventsQuerySchema = z.object({
    skip: z.coerce.number().min(0).optional().default(0),
    take: z.coerce.number().min(1).max(100).optional().default(50),
    eventType: z.string().optional(),
    sourceModule: z.string().optional(),
});

export const observabilityRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    // Get Global Events Timeline
    fastify.get('/events', async (req, reply) => {
        const { workspaceId } = req.user;
        const query = GetEventsQuerySchema.parse(req.query);

        const where: any = { workspaceId };
        if (query.eventType) where.eventType = query.eventType;
        if (query.sourceModule) where.sourceModule = query.sourceModule;

        const [events, total] = await Promise.all([
            prisma.eventLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: query.skip,
                take: query.take,
            }),
            prisma.eventLog.count({ where })
        ]);

        return reply.send({
            success: true,
            data: { events, total }
        });
    });

    // Get Platform Metrics
    fastify.get('/metrics', async (req, reply) => {
        const { workspaceId } = req.user;

        // E.g. last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // 1. Total Executions
        const totalExecutions = await prisma.automationExecution.count({
            where: { workspaceId, createdAt: { gte: thirtyDaysAgo } }
        });

        // 2. Failed Executions
        const failedExecutions = await prisma.automationExecution.count({
            where: { workspaceId, status: 'FAILED', createdAt: { gte: thirtyDaysAgo } }
        });

        // 3. Node Execution Metrics (Total Nodes Executed vs Failed)
        // Find execution IDs for this workspace first since NodeExecutionLog doesn't have workspaceId
        const recentExecutions = await prisma.automationExecution.findMany({
            where: { workspaceId, createdAt: { gte: thirtyDaysAgo } },
            select: { id: true }
        });
        const executionIds = recentExecutions.map(e => e.id);

        let totalNodes = 0;
        let failedNodes = 0;

        if (executionIds.length > 0) {
            totalNodes = await prisma.nodeExecutionLog.count({
                where: { executionId: { in: executionIds } }
            });

            failedNodes = await prisma.nodeExecutionLog.count({
                where: { executionId: { in: executionIds }, status: 'FAILED' }
            });
        }

        // 4. Automation rules count
        const activeRules = await prisma.automationRule.count({
            where: { workspaceId, isActive: true }
        });

        return reply.send({
            success: true,
            data: {
                totalExecutions,
                failedExecutions,
                totalNodesExecuted: totalNodes,
                failedNodes,
                activeRules,
                executionSuccessRate: totalExecutions > 0 ? ((totalExecutions - failedExecutions) / totalExecutions) * 100 : 100,
                nodeSuccessRate: totalNodes > 0 ? ((totalNodes - failedNodes) / totalNodes) * 100 : 100
            }
        });
    });
};
