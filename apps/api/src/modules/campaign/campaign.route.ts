import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
    CreateCampaignSchema,
    UpdateCampaignSchema,
    AddCampaignMembersSchema
} from '@yesbheem/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import * as campaignService from './campaign.service';

export const campaignRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    // List Campaigns
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const skip = Number(req.query && (req.query as any).skip) || 0;
        const take = Number(req.query && (req.query as any).take) || 20;

        const data = await campaignService.getCampaigns(workspaceId, skip, take);
        return reply.send({ success: true, data });
    });

    // Create Campaign
    fastify.post('/', { preHandler: requireRole('campaigns:create') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const input = CreateCampaignSchema.parse(req.body);

        const data = await campaignService.createCampaign(workspaceId, input);
        return reply.status(201).send({ success: true, data });
    });

    // Get Single Campaign
    fastify.get('/:id', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        const data = await campaignService.getCampaign(workspaceId, id);
        return reply.send({ success: true, data });
    });

    // Update Campaign
    fastify.patch('/:id', { preHandler: requireRole('campaigns:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = UpdateCampaignSchema.parse(req.body);

        const data = await campaignService.updateCampaign(workspaceId, id, input);
        return reply.send({ success: true, data });
    });

    // Add Audience Members (Bulk)
    fastify.post('/:id/members', { preHandler: requireRole('campaigns:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const input = AddCampaignMembersSchema.parse(req.body);

        const data = await campaignService.addCampaignMembers(workspaceId, id, input);
        return reply.status(201).send({ success: true, data });
    });

    // Manually Trigger Start
    fastify.post('/:id/start', { preHandler: requireRole('campaigns:update') }, async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        const data = await campaignService.startCampaign(workspaceId, id);
        return reply.status(202).send({ success: true, data });
    });
};
