import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
    CreateAutomationRuleSchema,
    UpdateAutomationRuleSchema
} from '@whatszor/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as automationService from './automation.service';

export const automationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    // List active macros
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const data = await automationService.getRules(workspaceId);
        return reply.sendSuccess(data);
    });

    // Create macro
    fastify.post('/', { preHandler: requireRole('automation:create') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const input = CreateAutomationRuleSchema.parse(req.body);

        const data = await automationService.createRule(workspaceId, input);
        return reply.code(201).sendSuccess(data);
    });

    // Get macro details
    fastify.get('/:id', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        const data = await automationService.getRule(workspaceId, id);
        return reply.sendSuccess(data);
    });

    // Update macro (enable/disable, etc)
    fastify.patch('/:id', { preHandler: requireRole('automation:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = UpdateAutomationRuleSchema.parse(req.body);

        const data = await automationService.updateRule(workspaceId, id, input);
        return reply.sendSuccess(data);
    });

    // Delete macro
    fastify.delete('/:id', { preHandler: requireRole('automation:delete') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        await automationService.deleteRule(workspaceId, id);
        return reply.code(204).sendSuccess(null);
    });

    // Get executions for a rule
    fastify.get('/:id/executions', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const { page = 1, limit = 10 } = req.query as { page?: number, limit?: number };

        const data = await automationService.getRuleExecutions(workspaceId, id, Number(page), Number(limit));
        return reply.sendSuccess(data);
    });

    // Get execution logs for a specific run
    fastify.get('/:id/executions/:executionId/logs', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id, executionId } = req.params as { id: string, executionId: string };

        const data = await automationService.getExecutionLogs(workspaceId, id, executionId);
        return reply.sendSuccess(data);
    });

    // Simulate an automation flow execution
    fastify.post('/:id/simulate', { preHandler: requireRole('automation:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const payload = req.body as any;

        const data = await automationService.simulateRule(workspaceId, id, payload);
        return reply.sendSuccess(data);
    });
};
