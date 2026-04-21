/**
 * lead-generation.route.ts — Fastify routes for the Lead Generation module
 *
 * Routes:
 *   POST   /lead-generation/preview           → Lightweight preview (no records created)
 *   POST   /lead-generation/search            → Enqueue lead generation job (202)
 *   GET    /lead-generation                   → List all lead lists for workspace
 *   GET    /lead-generation/:id              → Get lead list + paginated leads
 *   POST   /lead-generation/:id/convert      → Convert leads to CRM contacts
 *   DELETE /lead-generation/:id              → Delete lead list
 *
 * All routes are authenticated and workspace-scoped.
 * Errors expose statusCode and code from the service layer.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as leadService from './lead-generation.service';

export const leadGenerationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', authenticate);

    // ── POST /preview ──────────────────────────────────────────────────────────
    fastify.post('/preview', async (req, reply) => {
        const { workspaceId } = req.user;
        const { query } = req.body as { query?: string };

        if (!query?.trim()) {
            return reply.sendError({ message: 'query is required', code: 'BAD_REQUEST' }, 400);
        }

        try {
            const result = await leadService.previewLeadSearch(workspaceId, query.trim());
            return reply.sendSuccess(result);
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // ── POST /search ───────────────────────────────────────────────────────────
    fastify.post('/search', async (req, reply) => {
        const { workspaceId } = req.user;
        const body = req.body as {
            query?: string;
            name?: string;
            maxResults?: number;
            fetchMaximum?: boolean;
        };

        if (!body.query?.trim()) {
            return reply.sendError({ message: 'query is required', code: 'BAD_REQUEST' }, 400);
        }

        // maxResults validation only applies for non-maximum fetches
        if (!body.fetchMaximum && body.maxResults !== undefined) {
            const n = Number(body.maxResults);
            if (!Number.isInteger(n) || n < 1 || n > 20) {
                return reply.sendError(
                    { message: 'maxResults must be an integer between 1 and 20', code: 'BAD_REQUEST' },
                    400,
                );
            }
        }

        try {
            const leadList = await leadService.createLeadList(workspaceId, {
                query: body.query!.trim(),
                name: body.name,
                maxResults: body.maxResults,
                fetchMaximum: body.fetchMaximum,
            });

            return reply.code(202).sendSuccess({
                leadListId: leadList.id,
                status: leadList.status,
                jobId: leadList.jobId,
                message: 'Lead generation started. You will be notified when results are ready.',
            });
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // ── POST /batch ────────────────────────────────────────────────────────────
    fastify.post('/batch', async (req, reply) => {
        const { workspaceId } = req.user;
        const body = req.body as {
            rootQuery: string;
            segments: { keyword: string; location: string }[];
        };

        if (!body.rootQuery?.trim() || !Array.isArray(body.segments) || body.segments.length === 0) {
            return reply.sendError({ message: 'rootQuery and non-empty segments array are required', code: 'BAD_REQUEST' }, 400);
        }

        try {
            const result = await leadService.batchCreateLeadLists(workspaceId, {
                rootQuery: body.rootQuery.trim(),
                segments: body.segments,
            });

            return reply.code(202).sendSuccess({
                audienceId: result.audience.id,
                message: `Lead gathering initialized for ${result.batches.length} sub-segments into audience.`,
            });
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // ── GET / ──────────────────────────────────────────────────────────────────
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = req.user;
        const { skip, take } = req.query as { skip?: string; take?: string };

        try {
            const result = await leadService.getLeadLists(workspaceId, {
                skip: skip ? parseInt(skip, 10) : undefined,
                take: take ? parseInt(take, 10) : undefined,
            });
            return reply.sendSuccess(result);
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // ── GET /:id ───────────────────────────────────────────────────────────────
    fastify.get('/:id', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const { skip, take, filter } = req.query as {
            skip?: string;
            take?: string;
            filter?: 'all' | 'with_phone' | 'converted' | 'raw';
        };

        try {
            const result = await leadService.getLeadList(workspaceId, id, {
                skip: skip ? parseInt(skip, 10) : undefined,
                take: take ? parseInt(take, 10) : undefined,
                filter,
            });
            return reply.sendSuccess(result);
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // ── POST /:id/convert ──────────────────────────────────────────────────────
    fastify.post('/:id/convert', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };
        const body = req.body as {
            leadIds?: string[];
            skipExisting?: boolean;
            // Audience integration
            createAudience?: boolean;
            audienceId?: string;
        } | undefined;

        if (body?.leadIds !== undefined && !Array.isArray(body.leadIds)) {
            return reply.sendError(
                { message: 'leadIds must be an array of strings', code: 'BAD_REQUEST' },
                400,
            );
        }

        try {
            const result = await leadService.convertLeads(workspaceId, id, {
                leadIds: body?.leadIds,
                skipExisting: body?.skipExisting ?? true,
                createAudience: body?.createAudience,
                audienceId: body?.audienceId,
            });
            return reply.sendSuccess(result);
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // ── DELETE /:id ────────────────────────────────────────────────────────────
    fastify.delete('/:id', async (req, reply) => {
        const { workspaceId } = req.user;
        const { id } = req.params as { id: string };

        try {
            await leadService.deleteLeadList(workspaceId, id);
            return reply.sendSuccess({ message: 'Lead list deleted' });
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });
};
