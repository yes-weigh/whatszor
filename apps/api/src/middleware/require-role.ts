import type { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';
import { PERMISSION_SETS } from '../core/permissions';

/**
 * Fastify preHandler hook to enforce Role-Based Access Control (RBAC).
 * Assumes `request.user` has been populated by the `authenticate` middleware,
 * including `request.user.role` mapped to the workspace.
 *
 * @param requiredPermissions List of permission strings or explicit 'OWNER' literal.
 */
export function requireRole(...requiredPermissions: string[]) {
    return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
        const userRole = request.user?.role as UserRole;

        if (!userRole) {
            return reply.status(401).send({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Missing user role context' },
            });
        }

        // Special strict case for actions requiring explicit OWNER role (bypassing permissions)
        if (requiredPermissions.includes('OWNER') && userRole !== 'OWNER') {
            return reply.status(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'This action requires the workspace OWNER role.' },
            });
        }

        // Evaluate standard permissions using O(1) Set lookup
        const userPermissions = PERMISSION_SETS[userRole];
        if (!userPermissions) {
             return reply.status(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Invalid role configuration' },
            });
        }

        const hasAccess = requiredPermissions.every(permission => {
             // Skip 'OWNER' and 'ADMIN' literals since they are legacy hardcoded params now natively supported or checked above.
             if (permission === 'OWNER' || permission === 'ADMIN') return true;
             return userPermissions.has(permission);
        });

        if (!hasAccess) {
            return reply.status(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Insufficient permissions for this action.' },
            });
        }
    };
}
