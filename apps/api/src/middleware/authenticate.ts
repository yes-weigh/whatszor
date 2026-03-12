import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../core/jwt';
import type { TokenPayload } from '@yesbheem/shared';

/**
 * Augment Fastify's request type so TypeScript knows about request.user.
 */
declare module 'fastify' {
    interface FastifyRequest {
        user: TokenPayload;
    }
}

/**
 * Authenticate middleware — verifies the Bearer token in Authorization header.
 * Attaches the decoded TokenPayload to request.user.
 *
 * Usage: fastify.addHook('preHandler', authenticate)
 * Or per-route: { preHandler: authenticate }
 */
export async function authenticate(
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

        request.user = payload;
    } catch {
        return reply.status(401).send({
            success: false,
            error: { code: 'TOKEN_EXPIRED', message: 'Access token is expired or invalid' },
        });
    }
}

