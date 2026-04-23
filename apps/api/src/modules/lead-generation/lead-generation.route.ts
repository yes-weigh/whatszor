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
import { QueryPlannerService } from './query-planner.service';
import { AdaptiveExecutionService } from './adaptive-execution.service';
import { prisma } from '../../prisma/client';

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

    // ── POST /smart-search ─────────────────────────────────────────────────────
    // Accepts a single natural language query like "grocery shops in madhurai",
    // auto-parses it into keyword + city, generates synonym keywords via AI,
    // then fires batch generation for all synonyms in one shot.
    fastify.post('/smart-search', async (req, reply) => {
        const { workspaceId } = req.user;
        const { query } = req.body as { query?: string };

        if (!query?.trim()) {
            return reply.sendError({ message: 'query is required', code: 'BAD_REQUEST' }, 400);
        }

        try {
            const { expandLeadQuery } = await import('../ai/ai.service');
            const expanded = await expandLeadQuery(query.trim());

            if (!expanded.city) {
                return reply.sendError({
                    message: 'Could not detect a city in your query. Try: "bakeries in Mumbai"',
                    code: 'PARSE_FAILED'
                }, 422);
            }

            // Build segments: primary keyword + all synonyms, all in the same city
            const allKeywords = [expanded.keyword, ...expanded.synonyms];
            const segments = allKeywords.map(kw => ({
                keyword: kw,
                location: expanded.city,
            }));

            const result = await leadService.batchCreateLeadLists(workspaceId, {
                rootQuery: query.trim(),
                segments,
            });

            return reply.code(202).sendSuccess({
                audienceId: result.audience.id,
                keyword: expanded.keyword,
                city: expanded.city,
                synonymsUsed: expanded.synonyms,
                totalSearches: segments.length,
                message: `Intelligent search launched across ${segments.length} keyword variations in ${expanded.city}.`,
            });
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });



    // ── POST /optimizer/plan ───────────────────────────────────────────────────
    fastify.post('/optimizer/plan', async (req, reply) => {
        const { workspaceId } = req.user;
        const body = req.body as {
            city: string;
            cityLat?: number;
            cityLng?: number;
            keywords: string[];
            maxBudget: number;
        };

        if (!body.city || !body.keywords || !body.maxBudget) {
            return reply.sendError({ message: 'city, keywords, and maxBudget are required', code: 'BAD_REQUEST' }, 400);
        }

        try {
            const result = await QueryPlannerService.planLeadCampaign({
                workspaceId,
                city: body.city,
                cityLat: body.cityLat,
                cityLng: body.cityLng,
                keywords: body.keywords,
                maxBudget: body.maxBudget,
            });
            return reply.sendSuccess(result);
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // ── POST /optimizer/execute ────────────────────────────────────────────────
    fastify.post('/optimizer/execute', async (req, reply) => {
        const { workspaceId } = req.user;
        const body = req.body as {
            planBatchId: string;
            selectedPlanIds: string[];
        };

        if (!body.planBatchId || !Array.isArray(body.selectedPlanIds)) {
            return reply.sendError({ message: 'planBatchId and selectedPlanIds are required', code: 'BAD_REQUEST' }, 400);
        }

        try {
            // Mark non-selected as SKIPPED
            await prisma.leadQueryPlan.updateMany({
                where: {
                    workspaceId,
                    planBatchId: body.planBatchId,
                    id: { notIn: body.selectedPlanIds }
                },
                data: { status: 'SKIPPED' }
            });

            // Trigger background execution
            AdaptiveExecutionService.executeCampaignBatch(workspaceId, body.planBatchId)
                .catch((err: any) => req.log.error({ err, planBatchId: body.planBatchId }, 'Batch execution failed'));

            return reply.code(202).sendSuccess({
                message: 'Execution started for selected plans',
                planBatchId: body.planBatchId
            });
        } catch (err: any) {
            return reply.sendError(
                { message: err.message, code: err.code ?? 'INTERNAL_ERROR' },
                err.statusCode ?? 500,
            );
        }
    });

    // ── GET /optimizer/plans/:planBatchId ──────────────────────────────────────
    fastify.get('/optimizer/plans/:planBatchId', async (req, reply) => {
        const { workspaceId } = req.user;
        const { planBatchId } = req.params as { planBatchId: string };

        try {
            const plans = await prisma.leadQueryPlan.findMany({
                where: { workspaceId, planBatchId },
                orderBy: { createdAt: 'asc' }
            });
            return reply.sendSuccess({ plans });
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
