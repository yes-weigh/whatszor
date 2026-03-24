import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { requireActiveWorkspace } from '../../middleware/requireActiveWorkspace';
import * as knowledgeService from './knowledge.service';
import multipart from '@fastify/multipart';
import { parse } from 'csv-parse/sync';
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
        return reply.send({ success: true, data });
    });

    // Update Product
    fastify.patch('/:id', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id } = req.params as { id: string };
        const input = UpdateProductSchema.parse(req.body);

        const data = await knowledgeService.updateProduct(workspaceId, id, input);
        return reply.send({ success: true, data });
    });

    // Import Products via CSV
    fastify.post('/import', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const data = await req.file();
        
        if (!data) {
            return reply.status(400).send({ success: false, error: 'No file uploaded' });
        }

        const buffer = await data.toBuffer();
        const records = parse(buffer, { 
            columns: true, 
            skip_empty_lines: true,
            trim: true
        });

        const result = await knowledgeService.importProducts(workspaceId, records);
        return reply.send({ success: true, ...result });
    });

    // Manual Outreach Trigger
    fastify.post('/trigger-outreach', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const result = await knowledgeService.triggerOutreach(workspaceId);
        return reply.send({ success: true, ...result });
    });

    // ── PHASE 7: Observability Metrics & Debugging ──────────────────────────

    fastify.get('/metrics', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const metrics = await knowledgeService.getMetrics(workspaceId);
        return reply.send({ success: true, data: metrics });
    });

    // Dedicated endpoint decoupled from specific products to allow reprocessing ORPHANED triggers easily.
    fastify.post('/sources/:sourceId/reprocess', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { sourceId } = req.params as { sourceId: string };
        const result = await knowledgeService.reprocessSource(workspaceId, sourceId);
        return reply.send({ success: true, ...result });
    });

    // ── PHASE 6: Admin UI Endpoints ─────────────────────────────────────────

    // Get all extracted sources mapping to a specific product
    fastify.get('/:id/sources', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id } = req.params as { id: string };
        const sources = await knowledgeService.getProductSources(workspaceId, id);
        return reply.send({ success: true, data: sources });
    });

    // Manually push verified Extraction Specs into Product Knowledge overriding conflicts
    fastify.post('/:id/sources/:sourceId/apply', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id, sourceId } = req.params as { id: string, sourceId: string };
        const inputData = req.body as { description?: string, specifications?: Record<string, any>, features?: string[] };
        
        await knowledgeService.applySource(workspaceId, id, sourceId, inputData);
        return reply.send({ success: true, message: 'Source application applied cleanly' });
    });

    // Explicitly reject Extracted payloads flagged as Invalid by Human Reviewer
    fastify.post('/:id/sources/:sourceId/reject', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id, sourceId } = req.params as { id: string, sourceId: string };
        
        await knowledgeService.rejectSource(workspaceId, id, sourceId);
        return reply.send({ success: true, message: 'Source flagged safely as discarded' });
    });

    // Finalize Review Stage transitioning Product Status accurately to Native Schemas
    fastify.post('/:id/verify', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id } = req.params as { id: string };
        
        const data = await knowledgeService.verifyProduct(workspaceId, id);
        return reply.send({ success: true, data });
    });

    // ── PHASE 9: Allowed Numbers Admin Endpoints ────────────────────────────

    fastify.get('/allowed-numbers', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const numbers = await knowledgeService.getAllowedNumbers(workspaceId);
        return reply.send({ success: true, data: numbers });
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
        return reply.send({ success: true, data });
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
        return reply.send({ success: true, data });
    });

    fastify.delete('/allowed-numbers/:id', async (req, reply) => {
        const { workspaceId } = (req as any).user;
        const { id } = req.params as { id: string };
        await knowledgeService.deleteAllowedNumber(workspaceId, id);
        return reply.send({ success: true, message: 'Allowed number discarded' });
    });
};
