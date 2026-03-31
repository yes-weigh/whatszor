import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { generateFlow } from './ai.service';

export const aiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

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
};
