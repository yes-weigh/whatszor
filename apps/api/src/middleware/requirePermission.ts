import type { FastifyRequest, FastifyReply } from 'fastify';
import { Permission, hasPermission } from '@whatszor/shared';

export function requirePermission(permission: Permission) {
    return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
        const userRole = request.user?.role;

        if (!userRole) {
            return reply.status(401).send({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Missing user role context' },
            });
        }

        const isAllowed = hasPermission(userRole, permission);

        if (!isAllowed) {
            return reply.status(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: `Insufficient permissions. Requires: ${permission}` },
            });
        }
    };
}
