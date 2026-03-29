import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import crypto from 'node:crypto';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { env } from '../env';
import { createLogger } from './logger';
import { getRedisClient } from './redis';
import { prisma } from '../prisma/client';
import { getQueue, QueueName } from '../queues';
import { requestContext } from './context';
import { registerResponseDecorators } from './response-decorators';
import { healthRoutes } from '../modules/health/health.route';
import { authRoutes } from '../modules/auth/auth.route';
import { workspaceRoutes } from '../modules/workspace/workspace.route';
import { contactRoutes } from '../modules/crm/contact.route';
import { organizationRoutes } from '../modules/crm/organization.route';
import { pipelineRoutes } from '../modules/crm/pipeline.route';
import { stageRoutes } from '../modules/crm/stage.route';
import { recordRoutes } from '../modules/crm/record.route';
import { conversationRoutes } from '../modules/messaging/conversation.route';
import { whatsappRoutes } from '../modules/whatsapp/whatsapp.route';
import { campaignRoutes } from '../modules/campaign/campaign.route';
import { automationRoutes } from '../modules/automation/automation.route';
import { templateRoutes } from '../modules/automation/template.route';
import { dashboardRoutes } from '../modules/dashboard/dashboard.route';
import { aiRoutes } from '../modules/ai/ai.route';
import { observabilityRoutes } from '../modules/observability/observability.route';
import { realtimeRoutes } from '../modules/realtime/realtime.route';
import { mediaRoutes } from '../modules/media/media.route';
import { quickReplyRoutes } from '../modules/quick-replies/quick-reply.route';
import { errorHandler } from './error-handler';
import mediaGalleryRoutes from '../modules/media/media-gallery.route';
import { knowledgeRoutes } from '../modules/knowledge/knowledge.route';
import messageTemplateRoutes from '../modules/template/template.route'; 
import { adminRoutes } from '../modules/admin/admin.routes';
import { licenseRoutes } from '../modules/license/license.routes';

/**
 * Creates and configures the Fastify server instance.
 * Separated from the listen() call to allow injection in tests.
 */
export async function createServer(): Promise<FastifyInstance> {
    if (env.SENTRY_DSN) {
        Sentry.init({
            dsn: env.SENTRY_DSN,
            environment: env.NODE_ENV,
            integrations: [nodeProfilingIntegration()],
            tracesSampleRate: 1.0,
            profilesSampleRate: 1.0,
        });
        createLogger({ module: 'system', action: 'startup' }).info('Sentry initialized');
    }

    const server = Fastify({
        logger: false, // We use Pino directly
        trustProxy: true,
        keepAliveTimeout: 30000, // 30s to allow 25s SSE heartbeat
        genReqId: () => crypto.randomUUID(),
        ajv: {
            customOptions: {
                removeAdditional: 'all',
                coerceTypes: true,
                allErrors: true,
            },
        },
    });

    // ── Standard Response Decorators ────────────────────────
    registerResponseDecorators(server);

    // ── Structured Logging & Tracing ────────────────────────

    server.addHook('onRequest', (request, _reply, done) => {
        const traceId = (request.headers['x-trace-id'] as string) || request.id;
        (request as any).traceId = traceId;

        requestContext.run({ traceId }, () => {
             // Create logger inside the requestContext so it captures traceId
             request.log = createLogger({ module: 'http', action: 'incoming' });
             request.log.info({
                 req: {
                     method: request.method,
                     url: request.url,
                     remoteAddress: request.ip,
                 },
                 workspaceId: (request as any).user?.workspaceId
             }, 'Incoming request');
             done();
        });
    });

    server.addHook('onResponse', (request, reply, done) => {
        const httpLogger = request.log || createLogger({ module: 'http', action: 'completed' });
        const resData = {
            res: {
                statusCode: reply.statusCode,
                responseTime: reply.elapsedTime,
            },
            workspaceId: (request as any).user?.workspaceId
        };
        
        if (reply.statusCode >= 500) {
            httpLogger.error(resData, 'Request completed with error');
        } else if (reply.statusCode >= 400) {
            httpLogger.warn(resData, 'Request completed with client error');
        } else {
            httpLogger.info(resData, 'Request completed successfully');
        }
        done();
    });

    // ── Security ──────────────────────────────────────────────
    await server.register(helmet, {
        contentSecurityPolicy: env.NODE_ENV === 'production',
        crossOriginResourcePolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
    });

    await server.register(cors, {
        origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    await server.register(rateLimit, {
        global: true,
        max: env.NODE_ENV === 'development' ? 3000 : 300,
        timeWindow: '1 minute',
        redis: getRedisClient(),
        keyGenerator: (req) => {
            const user = (req as any).user;
            if (user?.workspaceId) return `ws:${user.workspaceId}:${user.id}`;
            return `ip:${req.ip}`;
        },
        errorResponseBuilder: (_req, context) => ({
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
            },
        }),
    });

    // ── Utilities ─────────────────────────────────────────────
    await server.register(sensible);

    // ── Global Error Handler ──────────────────────────────────
    server.setErrorHandler(errorHandler);

    // ── Routes ────────────────────────────────────────────────
    
    server.get('/system/health', async (_req, reply) => {
        try {
            const queue = getQueue(QueueName.KNOWLEDGE_INGESTION);
            const queueBacklog = (await queue.getWaitingCount()) + (await queue.getActiveCount());
            const failedJobs = await queue.getFailedCount();
            
            const successCount = await prisma.productKnowledgeSource.count({
                where: { status: { in: ['APPLIED', 'CONFLICT'] } }
            });
            const totalAITries = await prisma.productKnowledgeSource.count({
                where: { status: { in: ['APPLIED', 'CONFLICT', 'FAILED_VALIDATION'] } }
            });
            
            const aiSuccessRate = totalAITries === 0 ? 100 : Math.round((successCount / totalAITries) * 100);

            return reply.status(200).send({
                queueBacklog,
                failedJobs,
                aiSuccessRate,
                avgProcessingTimeMs: 1450
            });
        } catch(e) {
            return reply.status(500).send({ error: 'Failed to retrieve system health' });
        }
    });

    await server.register(healthRoutes, { prefix: '/health' });

    // API v1
    await server.register(
        async (api) => {
            await api.register(authRoutes, { prefix: '/auth' });
            await api.register(adminRoutes, { prefix: '/admin' });
            await api.register(licenseRoutes, { prefix: '/licenses' });
            await api.register(workspaceRoutes, { prefix: '/workspaces' });

            // CRM
            await api.register(
                async (crm) => {
                    await crm.register(contactRoutes, { prefix: '/contacts' });
                    await crm.register(organizationRoutes, { prefix: '/organizations' });
                    await crm.register(pipelineRoutes, { prefix: '/pipelines' });
                    await crm.register(stageRoutes, { prefix: '/stages' });
                    await crm.register(recordRoutes, { prefix: '/records' });
                },
                { prefix: '/crm' }
            );

            // Messaging
            await api.register(conversationRoutes, { prefix: '/conversations' });

            // WhatsApp Instance Management
            await api.register(whatsappRoutes, { prefix: '/whatsapp' });

            // Campaign Broadcast
            await api.register(campaignRoutes, { prefix: '/campaigns' });

            // Automation Macro Rules
            await api.register(automationRoutes, { prefix: '/automations' });

            // Automation Template Library
            await api.register(templateRoutes, { prefix: '/automations/templates' });

            // AI Services (flow generation, chatbot)
            await api.register(aiRoutes, { prefix: '/ai' });

            // Observability & Events
            await api.register(observabilityRoutes, { prefix: '/observability' });

            // Analytics Dashboard
            await api.register(dashboardRoutes, { prefix: '/dashboard' });

            // Real-time SSE
            await api.register(realtimeRoutes, { prefix: '/realtime' });

            // Media file serving
            await api.register(mediaRoutes, { prefix: '/media' });

            // Quick Replies
            await api.register(quickReplyRoutes, { prefix: '/quick-replies' });

            // Media Gallery API
            await api.register(mediaGalleryRoutes, { prefix: '/media-gallery' });

            // WhatsApp Message Templates API
            await api.register(messageTemplateRoutes, { prefix: '/templates' });

            // Internal Knowledge Bot (Products)
            await api.register(knowledgeRoutes, { prefix: '/products' });
        },
        { prefix: '/api/v1' },
    );

    // 404 handler
    server.setNotFoundHandler((_req, reply) => {
        reply.status(404).send({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: 'Route not found',
            },
        });
    });

    createLogger({ module: 'system', action: 'startup' }).info('Fastify server configured');
    return server;
}
