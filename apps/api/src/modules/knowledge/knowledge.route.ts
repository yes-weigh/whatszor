import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as knowledgeService from './knowledge.service';
import multipart from '@fastify/multipart';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { requireActiveWorkspace } from '../../middleware/requireActiveWorkspace';

const UpdateProductSchema = z.object({
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    price: z.number().nullable().optional(),
    category: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    status: z.enum(['INCOMPLETE', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED']).optional(),
    specifications: z.record(z.any()).optional(),
});

export const knowledgeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // Register multipart for CSV uploads (10MB limit)
    fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', requireActiveWorkspace);

    // List Products
    fastify.get('/', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const skip = Number((req.query as any)?.skip) || 0;
        const take = Number((req.query as any)?.take) || 20;

        const data = await knowledgeService.getProducts(workspaceId, skip, take);
        return reply.sendSuccess(data);
    });

    // Update Product
    fastify.patch('/:id', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id } = req.params as { id: string };
        const input = UpdateProductSchema.parse(req.body);

        const data = await knowledgeService.updateProduct(workspaceId, id, input);
        return reply.sendSuccess(data);
    });

    // Import Products via CSV
    fastify.post('/import', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
    }, async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const data = await req.file();

        if (!data) {
            return reply.code(400).sendError({ code: 'NO_FILE', message: 'No file uploaded' });
        }

        const buffer = await data.toBuffer();
        const records = parse(buffer, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        const result = await knowledgeService.importProducts(workspaceId, records);
        return reply.sendSuccess(result);
    });

    // Manual Outreach Trigger
    fastify.post('/trigger-outreach', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
    }, async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const result = await knowledgeService.triggerOutreach(workspaceId);
        return reply.sendSuccess(result);
    });

    // ── Observability Metrics & Debugging ───────────────────────────────────

    fastify.get('/metrics', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const metrics = await knowledgeService.getMetrics(workspaceId);
        return reply.sendSuccess(metrics);
    });

    fastify.get('/analytics/products', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const metrics = await knowledgeService.getProductAnalytics(workspaceId);
        return reply.sendSuccess(metrics);
    });

    // Dedicated endpoint for reprocessing ORPHANED triggers easily.
    fastify.post('/sources/:sourceId/reprocess', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { sourceId } = req.params as { sourceId: string };
        const result = await knowledgeService.reprocessSource(workspaceId, sourceId);
        return reply.sendSuccess(result);
    });

    // ── Admin UI Endpoints ──────────────────────────────────────────────────

    // Get all extracted sources mapping to a specific product
    fastify.get('/:id/sources', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id } = req.params as { id: string };
        const sources = await knowledgeService.getProductSources(workspaceId, id);
        return reply.sendSuccess(sources);
    });

    // Manually push verified Extraction Specs into Product Knowledge overriding conflicts
    fastify.post('/:id/sources/:sourceId/apply', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
    }, async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id, sourceId } = req.params as { id: string, sourceId: string };
        const inputData = req.body as { description?: string, specifications?: Record<string, any>, features?: string[] };

        await knowledgeService.applySource(workspaceId, id, sourceId, inputData);
        return reply.sendSuccess({ message: 'Source application applied cleanly' });
    });

    // Explicitly reject Extracted payloads flagged as Invalid by Human Reviewer
    fastify.post('/:id/sources/:sourceId/reject', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id, sourceId } = req.params as { id: string, sourceId: string };

        await knowledgeService.rejectSource(workspaceId, id, sourceId);
        return reply.sendSuccess({ message: 'Source flagged safely as discarded' });
    });

    // Finalize Review Stage transitioning Product Status accurately to Native Schemas
    fastify.post('/:id/verify', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id } = req.params as { id: string };

        const data = await knowledgeService.verifyProduct(workspaceId, id);
        return reply.sendSuccess(data);
    });

    // ── Allowed Numbers Admin Endpoints ────────────────────────────────────

    fastify.get('/allowed-numbers', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const numbers = await knowledgeService.getAllowedNumbers(workspaceId);
        return reply.sendSuccess(numbers);
    });

    fastify.post('/allowed-numbers', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const bodySchema = z.object({
            phoneNumber: z.string(),
            label: z.string().optional(),
            isActive: z.boolean().optional()
        });
        const input = bodySchema.parse(req.body);
        const data = await knowledgeService.createAllowedNumber(workspaceId, input);
        return reply.code(201).sendSuccess(data);
    });

    fastify.patch('/allowed-numbers/:id', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id } = req.params as { id: string };
        const bodySchema = z.object({
            label: z.string().optional(),
            isActive: z.boolean().optional()
        });
        const input = bodySchema.parse(req.body);
        const data = await knowledgeService.updateAllowedNumber(workspaceId, id, input);
        return reply.sendSuccess(data);
    });

    fastify.delete('/allowed-numbers/:id', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id } = req.params as { id: string };
        await knowledgeService.deleteAllowedNumber(workspaceId, id);
        return reply.sendSuccess({ message: 'Allowed number deleted' });
    });
};
