import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, verifyImpersonationToken } from '../core/jwt';
import type { TokenPayload } from '@whatszor/shared';
import { prisma } from '../prisma/client';
import { requestContext } from '../core/context';
import { isMemberBlocklisted } from '../core/token-blocklist';


/**
 * Augment Fastify's request type so TypeScript knows about request.user.
 */
declare module 'fastify' {
    interface FastifyRequest {
        user: TokenPayload;
    }
}

/**
 * authenticate — verifies the Bearer token in Authorization header.
 *
 * Supports two token types:
 *
 * 1. type:'access'        → Standard workspace-user JWT (existing behaviour)
 * 2. type:'impersonation' → Short-lived super-admin token. Verified against:
 *      - Separate signing secret (JWT_SECRET + ':impersonate')
 *      - ImpersonationLog.revokedAt === null  (not manually revoked)
 *      - ImpersonationLog.expiresAt > now()   (not expired; belt-and-suspenders vs JWT exp)
 *
 * IMPORTANT — Synthetic identity:
 *   When isImpersonating=true, request.user.sub = GlobalUser.id (NOT workspace User.id).
 *   Any code path that looks up `User.id = sub` MUST check `request.user.isImpersonating`
 *   first and skip or substitute accordingly.
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

    // ── Fast-path: decode header to detect token type without full verification ──
    // We parse the payload manually only to branch, then fully verify in the correct path.
    let rawType: string | undefined;
    try {
        const parts = token.split('.');
        if (parts.length === 3) {
            const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
            rawType = JSON.parse(payloadJson)?.type;
        }
    } catch {
        // If decoding fails, fall through to the normal verification which will also fail
    }

    // ── Impersonation token path ───────────────────────────────────────────────
    if (rawType === 'impersonation') {
        try {
            const payload = await verifyImpersonationToken(token);

            // DB-backed revocation check (bolt-on: even if JWT is still valid)
            const log = await prisma.impersonationLog.findUnique({
                where: { tokenJti: payload.jti },
                select: { revokedAt: true, expiresAt: true },
            });

            if (!log) {
                return reply.status(401).send({
                    success: false,
                    error: { code: 'UNAUTHORIZED', message: 'Impersonation token not found in audit log — rejected' },
                });
            }
            if (log.revokedAt !== null) {
                return reply.status(401).send({
                    success: false,
                    error: { code: 'TOKEN_REVOKED', message: 'Impersonation token has been revoked' },
                });
            }
            if (log.expiresAt < new Date()) {
                return reply.status(401).send({
                    success: false,
                    error: { code: 'TOKEN_EXPIRED', message: 'Impersonation token has expired' },
                });
            }

            // Inject synthetic workspace-OWNER identity.
            // sub remains GlobalUser.id — callers must not query workspace User by this ID.
            request.user = {
                sub: payload.sub,
                workspaceId: payload.workspaceId,
                role: 'OWNER',
                type: 'impersonation',
                isImpersonating: true,
            };

            const store = requestContext.getStore();
            if (store) {
                store.workspaceId = payload.workspaceId;
            }
        } catch {
            return reply.status(401).send({
                success: false,
                error: { code: 'TOKEN_EXPIRED', message: 'Impersonation token is expired or invalid' },
            });
        }
        return;
    }

    // ── Standard access token path ─────────────────────────────────────────────
    try {
        const payload = await verifyAccessToken(token);

        if (payload.type !== 'access') {
            return reply.status(401).send({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Invalid token type' },
            });
        }

        request.user = payload;

        // ── Removed-member blocklist check ──────────────────────────────────
        // If this user was removed from the workspace while they still held a
        // valid JWT, their userId+workspaceId pair is in Redis blocklist.
        if (payload.workspaceId && payload.sub && !payload.isImpersonating) {
            const blocked = await isMemberBlocklisted(payload.workspaceId, payload.sub);
            if (blocked) {
                return reply.status(401).send({
                    success: false,
                    error: { code: 'UNAUTHORIZED', message: 'Access revoked — you have been removed from this workspace' },
                });
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // Propagate workspaceId into ALS so all logs in this request include it
        const store = requestContext.getStore();
        if (store && payload.workspaceId) {
            store.workspaceId = payload.workspaceId;
        }

    } catch {
        return reply.status(401).send({
            success: false,
            error: { code: 'TOKEN_EXPIRED', message: 'Access token is expired or invalid' },
        });
    }
}
