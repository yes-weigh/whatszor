import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../prisma/client';

export async function requireActiveWorkspace(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    if (!request.user || !request.user.workspaceId) {
         return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' }
        });
    }

    // Admins bypass workspace checks
    if (request.user.workspaceId === 'ADMIN_WORKSPACE') {
        return;
    }

    const workspace = await prisma.workspace.findUnique({
        where: { id: request.user.workspaceId },
        select: { status: true, expiresAt: true }
    });

    if (!workspace) {
        return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Workspace not found' }
        });
    }

    if (workspace.status === 'SUSPENDED' || workspace.status === 'EXPIRED') {
        // Return 402 Payment Required so the frontend Axios interceptor can catch it
        // and redirect to the license activation page
        return reply.status(402).send({
            success: false,
            error: { code: 'PAYMENT_REQUIRED', message: `Workspace is ${workspace.status.toLowerCase()}. Please activate a license key.` }
        });
    }
    
    // Require ACTIVE status — TRIAL without expiry means the workspace is unactivated
    if (workspace.status === 'TRIAL') {
        // If there's an expiry and it's in the future, allow access (grace period)
        if (!workspace.expiresAt || workspace.expiresAt < new Date()) {
            return reply.status(402).send({
                success: false,
                error: { code: 'PAYMENT_REQUIRED', message: 'Workspace requires a license key to access this feature.' }
            });
        }
    }
}
