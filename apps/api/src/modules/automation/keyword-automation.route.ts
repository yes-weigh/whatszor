import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as kwService from './keyword-automation.service';

export const keywordAutomationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    // List all keyword automations for the workspace
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const data = await kwService.getKeywordAutomations(workspaceId);
        return reply.sendSuccess(data);
    });

    // Get a single automation
    fastify.get('/:id', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const data = await kwService.getKeywordAutomationById(workspaceId, id);
        return reply.sendSuccess(data);
    });

    // Get stats for an automation (trigger count, last triggered)
    fastify.get('/:id/stats', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const data = await kwService.getKeywordAutomationStats(workspaceId, id);
        return reply.sendSuccess(data);
    });

    // Create a new keyword automation
    fastify.post('/', { preHandler: requireRole('automation:create') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const body = req.body as any;

        if (!body.keyword || typeof body.keyword !== 'string' || !body.keyword.trim()) {
            return reply.code(400).sendError({ code: 'VALIDATION_ERROR', message: 'keyword is required' });
        }
        if (!body.replyText || typeof body.replyText !== 'string' || !body.replyText.trim()) {
            return reply.code(400).sendError({ code: 'VALIDATION_ERROR', message: 'replyText is required' });
        }

        const data = await kwService.createKeywordAutomation(workspaceId, {
            keyword: body.keyword,
            matchType: body.matchType,
            replyText: body.replyText,
            mediaId: body.mediaId ?? null,
            intent: body.intent ?? null,
            cooldownSec: body.cooldownSec,
        });
        return reply.code(201).sendSuccess(data);
    });

    // Update an automation (keyword, text, toggle on/off, etc.)
    fastify.patch('/:id', { preHandler: requireRole('automation:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const body = req.body as any;
        const data = await kwService.updateKeywordAutomation(workspaceId, id, body);
        return reply.sendSuccess(data);
    });

    // Delete an automation
    fastify.delete('/:id', { preHandler: requireRole('automation:delete') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        await kwService.deleteKeywordAutomation(workspaceId, id);
        return reply.code(204).sendSuccess(null);
    });
};
