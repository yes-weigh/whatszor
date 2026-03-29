import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreatePipelineSchema, UpdatePipelineSchema } from '@whatszor/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as pipelineService from './pipeline.service';

export const pipelineRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    fastify.post('/', { preHandler: requireRole('contacts:create') }, async (req, reply) => {
        const input = CreatePipelineSchema.parse(req.body);
        const pipeline = await pipelineService.createPipeline(req.user.workspaceId, input);
        return reply.sendSuccess(pipeline, 201);
    });

    fastify.get('/', async (req, reply) => {
        const pipelines = await pipelineService.listPipelines(req.user.workspaceId);
        return reply.sendSuccess(pipelines);
    });

    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const pipeline = await pipelineService.getPipeline(req.user.workspaceId, id);
        return reply.sendSuccess(pipeline);
    });

    fastify.patch('/:id', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = UpdatePipelineSchema.parse(req.body);
        const pipeline = await pipelineService.updatePipeline(req.user.workspaceId, id, input);
        return reply.sendSuccess(pipeline);
    });

    fastify.delete('/:id', { preHandler: requireRole('contacts:delete') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        await pipelineService.deletePipeline(req.user.workspaceId, id);
        return reply.sendSuccess({ message: 'Pipeline deleted' });
    });
};
