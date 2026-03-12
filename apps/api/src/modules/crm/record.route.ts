import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateRecordSchema, UpdateRecordSchema } from '@yesbheem/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as recordService from './record.service';
import { z } from 'zod';

export const recordRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    fastify.post('/', { preHandler: requireRole('contacts:create') }, async (req, reply) => {
        const input = CreateRecordSchema.parse(req.body);
        const record = await recordService.createRecord(req.user.workspaceId, input);
        return reply.status(201).send({ success: true, data: record });
    });

    fastify.get('/', async (req, reply) => {
        const query = z.object({ pipelineId: z.string().optional() }).parse(req.query);
        const records = await recordService.listRecords(req.user.workspaceId, query.pipelineId);
        return reply.send({ success: true, data: records });
    });

    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const record = await recordService.getRecord(req.user.workspaceId, id);
        return reply.send({ success: true, data: record });
    });

    fastify.patch('/:id', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const input = UpdateRecordSchema.parse(req.body);
        const record = await recordService.updateRecord(req.user.workspaceId, id, input);
        return reply.send({ success: true, data: record });
    });

    fastify.delete('/:id', { preHandler: requireRole('contacts:delete') }, async (req, reply) => {
        const { id } = req.params as { id: string };
        await recordService.deleteRecord(req.user.workspaceId, id);
        return reply.send({ success: true, data: { message: 'Record deleted' } });
    });
};
