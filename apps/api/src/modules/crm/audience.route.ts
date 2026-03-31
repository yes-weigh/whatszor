/**
 * @file audience.route.ts
 * @description /crm/audiences — Audience segment management.
 *
 * An Audience is a named group of contacts used to target campaigns.
 * All responses follow the standard contract: { success: true, data: T }
 *
 * NOTE: This implementation uses the Prisma `Audience` model. If the model
 * does not exist yet, this stub returns empty paginated lists so the frontend
 * remains functional while the schema migration is pending.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import { prisma } from '../../prisma/client';
import { ErrorCodes } from '@whatszor/shared';

export const audienceRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    /**
     * GET /crm/audiences
     * Returns { items: Audience[], total: number }
     */
    fastify.get('/', async (req, reply) => {
        const workspaceId = req.user?.workspaceId;
        if (!workspaceId) {
            return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);
        }

        try {
            const [items, total] = await Promise.all([
                (prisma as any).audience.findMany({
                    where: { workspaceId },
                    include: { _count: { select: { contacts: true } } },
                    orderBy: { createdAt: 'desc' },
                }),
                (prisma as any).audience.count({ where: { workspaceId } }),
            ]);

            // Normalize: expose contactCount at top level for the frontend
            const normalizedItems = items.map((a: any) => ({
                ...a,
                contactCount: a._count?.contacts ?? 0,
            }));

            return reply.sendSuccess({ items: normalizedItems, total });
        } catch (err: any) {
            // Graceful degradation if Audience model is not yet migrated
            if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
                fastify.log.warn('audience.route: Audience table not found — returning empty list. Run prisma migrate to create the table.');
                return reply.sendSuccess({ items: [], total: 0 });
            }
            throw err;
        }
    });

    /**
     * POST /crm/audiences
     * Body: { name: string; description?: string }
     */
    fastify.post('/', { preHandler: requireRole('contacts:manage') }, async (req, reply) => {
        const workspaceId = req.user?.workspaceId;
        if (!workspaceId) {
            return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);
        }

        const { name, description } = req.body as { name?: string; description?: string };
        if (!name?.trim()) {
            return reply.sendError({ code: 'BAD_REQUEST', message: 'Audience name is required' }, 400);
        }

        const audience = await (prisma as any).audience.create({
            data: { workspaceId, name: name.trim(), description: description?.trim() || null },
        });

        return reply.sendSuccess({ ...audience, contactCount: 0 }, 201);
    });

    /**
     * PATCH /crm/audiences/:id
     * Body: { name?: string; description?: string }
     */
    fastify.patch('/:id', { preHandler: requireRole('contacts:manage') }, async (req, reply) => {
        const workspaceId = req.user?.workspaceId;
        const { id } = req.params as { id: string };
        if (!workspaceId) {
            return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);
        }

        const { name, description } = req.body as { name?: string; description?: string };

        const existing = await (prisma as any).audience.findUnique({ where: { id, workspaceId } });
        if (!existing) {
            return reply.sendError({ code: 'NOT_FOUND', message: 'Audience not found' }, 404);
        }

        const updated = await (prisma as any).audience.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name: name.trim() } : {}),
                ...(description !== undefined ? { description: description?.trim() || null } : {}),
            },
            include: { _count: { select: { contacts: true } } },
        });

        return reply.sendSuccess({ ...updated, contactCount: updated._count?.contacts ?? 0 });
    });

    /**
     * DELETE /crm/audiences/:id
     * Deletes the audience group. Does NOT delete the underlying contacts.
     */
    fastify.delete('/:id', { preHandler: requireRole('contacts:manage') }, async (req, reply) => {
        const workspaceId = req.user?.workspaceId;
        const { id } = req.params as { id: string };
        if (!workspaceId) {
            return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);
        }

        const existing = await (prisma as any).audience.findUnique({ where: { id, workspaceId } });
        if (!existing) {
            return reply.sendError({ code: 'NOT_FOUND', message: 'Audience not found' }, 404);
        }

        await (prisma as any).audience.delete({ where: { id } });

        return reply.status(204).send();
    });
};
