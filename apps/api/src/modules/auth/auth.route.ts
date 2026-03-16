import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { RegisterSchema, LoginSchema, RefreshTokenSchema } from '@whatszor/shared';
import { registerUser, loginUser, refreshTokens, logoutUser } from './auth.service';
import { authenticate } from '../../middleware/authenticate';
import { prisma } from '../../prisma/client';

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    /**
     * POST /api/v1/auth/register
     * Creates a new user + workspace in a single atomic transaction.
     */
    fastify.post('/register', {
        config: { rateLimit: { max: 3, timeWindow: '1 minute', keyGenerator: (req: any) => `register:${req.ip}` } },
    }, async (req, reply) => {
        const body = RegisterSchema.parse(req.body);
        const tokens = await registerUser(body);
        return reply.status(201).send({ success: true, data: tokens });
    });

    /**
     * POST /api/v1/auth/login
     * Returns access + refresh tokens for valid credentials.
     * Rate-limited to 10 req/min per IP to prevent brute-force attacks.
     */
    fastify.post('/login', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (req: any) => `login:${req.ip}` } },
    }, async (req, reply) => {
        const body = LoginSchema.parse(req.body);
        const tokens = await loginUser(body);
        return reply.status(200).send({ success: true, data: tokens });
    });

    /**
     * POST /api/v1/auth/refresh
     * Rotates the refresh token — old one is revoked, new pair issued.
     */
    fastify.post('/refresh', async (req, reply) => {
        const { refreshToken } = RefreshTokenSchema.parse(req.body);
        const tokens = await refreshTokens(refreshToken);
        return reply.status(200).send({ success: true, data: tokens });
    });

    /**
     * POST /api/v1/auth/logout
     * Revokes the provided refresh token server-side.
     */
    fastify.post('/logout', async (req, reply) => {
        const { refreshToken } = RefreshTokenSchema.parse(req.body);
        await logoutUser(refreshToken);
        return reply.status(200).send({ success: true, data: { message: 'Logged out successfully' } });
    });

    /**
     * GET /api/v1/auth/me
     * Returns the currently authenticated user's profile (id, name, email, role, workspaceStatus).
     */
    fastify.get('/me', { preHandler: authenticate }, async (req, reply) => {
        const { sub, workspaceId, role } = req.user;
        const user = await prisma.user.findUnique({
            where: { id: sub },
            select: { id: true, name: true, email: true },
        });
        if (!user) return reply.status(404).send({ success: false, error: 'User not found' });

        // Fetch workspace status for gating enforcement
        let workspaceStatus: string | null = null;
        if (workspaceId && workspaceId !== 'ADMIN_WORKSPACE') {
            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { status: true }
            });
            workspaceStatus = workspace?.status ?? null;
        }

        return reply.send({
            success: true,
            data: { id: user.id, name: user.name, email: user.email, workspaceId, role, workspaceStatus },
        });
    });
};
