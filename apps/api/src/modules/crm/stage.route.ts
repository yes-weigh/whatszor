import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateStageSchema, UpdateStageSchema } from '@yesbheem/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as stageService from './stage.service';

// Note: these routes are mounted standalone (/api/v1/stages) to allow cross-pipeline moving.
// Creation usually passes the pipelineId explicitly in the body.
export const stageRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    fastify.post('/', { preHandler: requireRole('contacts:create') }, async (req, reply) => {
        const input = CreateStageSchema.parse(req.body);
        const stage = await stageService.createStage(req.user.workspaceId, input);
        return reply.status(201).send({ success: true, data: stage });
    });

    fastify.patch('/:id', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = UpdateStageSchema.parse(req.body);
        const stage = await stageService.updateStage(req.user.workspaceId, id, input);
        return reply.send({ success: true, data: stage });
    });

    fastify.delete('/:id', { preHandler: requireRole('contacts:delete') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        await stageService.deleteStage(req.user.workspaceId, id);
        return reply.send({ success: true, data: { message: 'Stage deleted' } });
    });
};
