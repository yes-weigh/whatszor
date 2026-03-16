import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UpdateWorkspaceSchema, InviteMemberSchema } from '@whatszor/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import {
    getWorkspace,
    updateWorkspace,
    listMembers,
    inviteMember,
    removeMember,
    updateMemberRole,
} from './workspace.service';

export const workspaceRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // All workspace routes require authentication
    fastify.addHook('preHandler', authenticate);

    /**
     * GET /api/v1/workspaces/me
     * Returns the current authenticated user's active workspace.
     */
    fastify.get('/me', async (req, reply) => {
        const workspace = await getWorkspace(req.user.workspaceId);
        return reply.send({ success: true, data: workspace });
    });

    /**
     * PATCH /api/v1/workspaces/me
     * Updates workspace name / settings. Requires OWNER or ADMIN.
     */
    fastify.patch(
        '/me',
        { preHandler: requireRole('workspace:manage') },
        async (req, reply) => {
            const body = UpdateWorkspaceSchema.parse(req.body);
            const workspace = await updateWorkspace(req.user.workspaceId, body);
            return reply.send({ success: true, data: workspace });
        },
    );

    /**
     * GET /api/v1/workspaces/me/members
     * Returns all members of the workspace.
     */
    fastify.get('/me/members', async (req, reply) => {
        const members = await listMembers(req.user.workspaceId);
        return reply.send({ success: true, data: members });
    });

    /**
     * POST /api/v1/workspaces/me/members
     * Invites an existing user to the workspace. Requires OWNER or ADMIN.
     */
    fastify.post(
        '/me/members',
        { preHandler: requireRole('members:manage') },
        async (req, reply) => {
            const body = InviteMemberSchema.parse(req.body);
            const member = await inviteMember(req.user.workspaceId, body);
            return reply.status(201).send({ success: true, data: member });
        },
    );

    /**
     * DELETE /api/v1/workspaces/me/members/:memberId
     * Removes a member. OWNER or ADMIN only. Cannot remove self or last owner.
     */
    fastify.delete(
        '/me/members/:memberId',
        { preHandler: requireRole('members:manage') },
        async (req, reply) => {
            const { memberId } = req.params as { memberId: string };
            await removeMember(req.user.workspaceId, memberId, req.user.sub);
            return reply.status(200).send({ success: true, data: { message: 'Member removed' } });
        },
    );

    /**
     * PATCH /api/v1/workspaces/me/members/:memberId
     * Updates a member's role.
     */
    fastify.patch(
        '/me/members/:memberId',
        { preHandler: requireRole('members:manage') },
        async (req, reply) => {
            const { memberId } = req.params as { memberId: string };
            const { role } = req.body as { role: import('@prisma/client').UserRole };
            const updated = await updateMemberRole(req.user.workspaceId, memberId, role);
            return reply.status(200).send({ success: true, data: updated });
        },
    );
};
