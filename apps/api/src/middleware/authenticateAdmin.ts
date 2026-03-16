import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../core/jwt';

export async function authenticateAdmin(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
        return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
        });
    }

    const token = header.slice(7);

    try {
        const payload = await verifyAccessToken(token);

        if (payload.type !== 'access') {
            return reply.status(401).send({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Invalid token type' },
            });
        }

        if (payload.workspaceId !== 'ADMIN_WORKSPACE' || (payload.role !== 'SUPER_ADMIN' && payload.role !== 'STAFF')) {
            return reply.status(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Admin access required' },
            });
        }

        request.user = payload;
    } catch {
        return reply.status(401).send({
            success: false,
            error: { code: 'TOKEN_EXPIRED', message: 'Access token is expired or invalid' },
        });
    }
}
