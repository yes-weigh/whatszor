import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { generateFlow, generateSuggestions } from './ai.service';

export const aiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    /**
     * POST /ai/suggest
     * Body: { messages: any[], contact: any }
     * Returns: { intent, confidence, suggestions }
     */
    fastify.post('/suggest', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } }
    }, async (req, reply) => {
        const { messages, contact } = req.body as { messages: any[], contact: any };
        
        if (!messages || !Array.isArray(messages)) {
            return reply.code(400).send({ success: false, error: 'Messages array is required' });
        }

        const result = await generateSuggestions(messages, contact);
        if (result.error) {
            return reply.code(500).send({ success: false, error: result.error });
        }

        return reply.send({ success: true, ...result });
    });

    /**
     * POST /ai/generate-flow
     * Body: { description: string }
     * Returns: { name, nodes, edges } — a valid ReactFlow graph ready to inject into the canvas
     */
    fastify.post('/generate-flow', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
    }, async (req, reply) => {
        const { description } = req.body as { description: string };

        if (!description || description.trim().length < 10) {
            return reply.code(400).sendError({
                code: 'INVALID_INPUT',
                message: 'Description must be at least 10 characters.',
            });
        }

        const result = await generateFlow(description.trim());

        if (result.error) {
            return reply.code(422).sendError({
                code: 'GENERATION_FAILED',
                message: result.error,
            });
        }

        return reply.sendSuccess(result);
    });

    /**
     * POST /ai/onboarding
     * Body: { messages: any[] }
     * Returns: { text }
     */
    fastify.post('/onboarding', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
    }, async (req, reply) => {
        const { messages } = req.body as { messages: any[] };

        if (!Array.isArray(messages)) {
            return reply.code(400).sendError({
                code: 'INVALID_INPUT',
                message: 'Messages array is required',
            });
        }

        // We fetch the workspace to get its name for context
        const { prisma } = require('../../prisma/client');
        const workspace = await prisma.workspace.findUnique({
            where: { id: req.user.workspaceId },
            select: { name: true }
        });

        const dbUser = await prisma.user.findUnique({
            where: { id: (req.user as any).sub } // Type assertion to access 'sub' safely from payload
        });

        const result = await require('./ai.service').generateOnboardingChat(
            req.user.workspaceId,
            messages,
            { orgName: workspace?.name || 'Your Organization', userEmail: dbUser?.email || '' }
        );

        if (result.error) {
            return reply.code(500).sendError({
                code: 'GENERATION_FAILED',
                message: result.error,
            });
        }

        return reply.sendSuccess({ text: result.text });
    });
};
