import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
    CreateCampaignSchema,
    UpdateCampaignSchema,
    AddCampaignMembersSchema,
    PopulateCampaignFromAudienceSchema,
} from '@whatszor/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as campaignService from './campaign.service';

import { requireActiveWorkspace } from '../../middleware/requireActiveWorkspace';

export const campaignRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', requireActiveWorkspace);

    // List Campaigns
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const skip = Number(req.query && (req.query as any).skip) || 0;
        const take = Number(req.query && (req.query as any).take) || 20;

        const data = await campaignService.getCampaigns(workspaceId, skip, take);
        return reply.sendSuccess(data);
    });

    // Create Campaign
    fastify.post('/', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } }, preHandler: requireRole('campaigns:create') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const input = CreateCampaignSchema.parse(req.body);

        const data = await campaignService.createCampaign(workspaceId, input as any);
        return reply.code(201).sendSuccess(data);
    });

    // Get Single Campaign
    fastify.get('/:id', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        const data = await campaignService.getCampaign(workspaceId, id);
        return reply.sendSuccess(data);
    });

    // Update Campaign
    fastify.patch('/:id', { preHandler: requireRole('campaigns:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = UpdateCampaignSchema.parse(req.body) as any;

        const data = await campaignService.updateCampaign(
            workspaceId,
            id,
            input as any,
            req.user.sub,    // actorUserId — for MEMBER session ownership check
            req.user.role,   // actorRole
        );
        return reply.sendSuccess(data);
    });

    // Add Audience Members (Bulk)
    fastify.post('/:id/members', { preHandler: requireRole('campaigns:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = AddCampaignMembersSchema.parse(req.body);

        const data = await campaignService.addCampaignMembers(workspaceId, id, input);
        return reply.code(201).sendSuccess(data);
    });

    // Manually Trigger Start
    fastify.post('/:id/start', { preHandler: requireRole('campaigns:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const { isFastMode } = (req.body as any) || { isFastMode: false };

        const data = await campaignService.startCampaign(workspaceId, id, !!isFastMode);
        return reply.code(202).sendSuccess(data);
    });

    // Manually Cancel/Stop Campaign
    fastify.post('/:id/cancel', { preHandler: requireRole('campaigns:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        const data = await campaignService.cancelCampaign(workspaceId, id);
        return reply.sendSuccess(data);
    });

    // Populate Campaign Members from an Audience (snapshot at call time)
    fastify.post('/:id/populate-from-audience', { preHandler: requireRole('campaigns:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const { audienceId } = PopulateCampaignFromAudienceSchema.parse(req.body);

        const data = await campaignService.populateFromAudience(workspaceId, id, audienceId);
        return reply.code(201).sendSuccess(data);
    });

    // Delete Campaign
    fastify.delete('/:id', { preHandler: requireRole('campaigns:delete') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        const data = await campaignService.deleteCampaign(workspaceId, id);
        return reply.sendSuccess(data);
    });
};
