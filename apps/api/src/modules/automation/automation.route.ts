import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
    CreateAutomationRuleSchema,
    UpdateAutomationRuleSchema
} from '@yesbheem/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as automationService from './automation.service';

export const automationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    // List active macros
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const data = await automationService.getRules(workspaceId);
        return reply.send({ success: true, data });
    });

    // Create macro
    fastify.post('/', { preHandler: requireRole('automation:create') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const input = CreateAutomationRuleSchema.parse(req.body);

        const data = await automationService.createRule(workspaceId, input);
        return reply.status(201).send({ success: true, data });
    });

    // Get macro details
    fastify.get('/:id', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        const data = await automationService.getRule(workspaceId, id);
        return reply.send({ success: true, data });
    });

    // Update macro (enable/disable, etc)
    fastify.patch('/:id', { preHandler: requireRole('automation:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = UpdateAutomationRuleSchema.parse(req.body);

        const data = await automationService.updateRule(workspaceId, id, input);
        return reply.send({ success: true, data });
    });

    // Delete macro
    fastify.delete('/:id', { preHandler: requireRole('automation:delete') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        await automationService.deleteRule(workspaceId, id);
        return reply.status(204).send();
    });

    // Get executions for a rule
    fastify.get('/:id/executions', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const { page = 1, limit = 10 } = req.query as { page?: number, limit?: number };

        const data = await automationService.getRuleExecutions(workspaceId, id, Number(page), Number(limit));
        return reply.send({ success: true, data });
    });

    // Get execution logs for a specific run
    fastify.get('/:id/executions/:executionId/logs', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id, executionId } = req.params as { id: string, executionId: string };

        const data = await automationService.getExecutionLogs(workspaceId, id, executionId);
        return reply.send({ success: true, data });
    });

    // Simulate an automation flow execution
    fastify.post('/:id/simulate', { preHandler: requireRole('automation:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const payload = req.body as any; // Allow accepting test payload data

        const data = await automationService.simulateRule(workspaceId, id, payload);
        return reply.send({ success: true, data });
    });
};
