import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
    CreateAudienceSchema,
    UpdateAudienceSchema,
    AddAudienceMembersSchema,
    RemoveAudienceMembersSchema,
    ImportLeadListSchema,
} from '@whatszor/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import { requireActiveWorkspace } from '../../middleware/requireActiveWorkspace';
import * as audienceService from './audience.service';

export const audienceRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', requireActiveWorkspace);

    // ── List Audiences ─────────────────────────────────────────────────────────
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const skip = Number((req.query as any).skip) || 0;
        const take = Number((req.query as any).take) || 50;
        const data = await audienceService.getAudiences(workspaceId, skip, take);
        return reply.sendSuccess(data);
    });

    // ── Create Audience ────────────────────────────────────────────────────────
    fastify.post('/', { preHandler: requireRole('contacts:create') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const input = CreateAudienceSchema.parse(req.body);
        const data = await audienceService.createAudience(workspaceId, input);
        return reply.code(201).sendSuccess(data);
    });

    // ── Get Single Audience ────────────────────────────────────────────────────
    fastify.get('/:id', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const data = await audienceService.getAudience(workspaceId, id);
        return reply.sendSuccess(data);
    });

    // ── Update Audience (name / description) ───────────────────────────────────
    fastify.patch('/:id', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = UpdateAudienceSchema.parse(req.body);
        const data = await audienceService.updateAudience(workspaceId, id, input);
        return reply.sendSuccess(data);
    });

    // ── Delete Audience ────────────────────────────────────────────────────────
    fastify.delete('/:id', { preHandler: requireRole('contacts:delete') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const data = await audienceService.deleteAudience(workspaceId, id);
        return reply.sendSuccess(data);
    });

    // ── List Members ───────────────────────────────────────────────────────────
    fastify.get('/:id/members', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const skip = Number((req.query as any).skip) || 0;
        const take = Number((req.query as any).take) || 100;
        const data = await audienceService.getAudienceMembers(workspaceId, id, skip, take);
        return reply.sendSuccess(data);
    });

    // ── Add Members ────────────────────────────────────────────────────────────
    fastify.post('/:id/members', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = AddAudienceMembersSchema.parse(req.body);
        const data = await audienceService.addAudienceMembers(workspaceId, id, input);
        return reply.code(201).sendSuccess(data);
    });

    // ── Remove Members ─────────────────────────────────────────────────────────
    fastify.delete('/:id/members', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = RemoveAudienceMembersSchema.parse(req.body);
        const data = await audienceService.removeAudienceMembers(workspaceId, id, input);
        return reply.sendSuccess(data);
    });

    // ── Sync / Import from Lead List ───────────────────────────────────────────
    fastify.post('/:id/import-lead-list', { preHandler: requireRole('contacts:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = ImportLeadListSchema.parse(req.body);
        const data = await audienceService.importFromLeadList(workspaceId, id, input);
        return reply.sendSuccess(data);
    });
};
