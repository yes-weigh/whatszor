import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma/client';
import { ErrorCodes } from '@whatszor/shared';
import { validateMessageVariables } from './template-renderer';
import { authenticate } from '../../middleware/authenticate';
import { createOrGetConversation } from '../messaging/conversation.service';
import { composeAndQueueMessage } from '../../core/messaging/message-composer';
import { RenderContext } from './template-renderer';
import { getStorageProvider } from '../../core/storage';
import multipart from '@fastify/multipart';
import { PLAN_LIMITS } from '../../core/config/pricing';

function buildRenderContext(flatVariables: Record<string, any> = {}): RenderContext {
    const context: any = {};
    for (const [key, value] of Object.entries(flatVariables)) {
        const parts = key.split('.');
        const lastPart = parts.pop();
        if (!lastPart) continue;

        let current = context;
        for (const part of parts) {
            if (!current[part]) current[part] = {};
            current = current[part];
        }
        current[lastPart] = value;
    }
    return context;
}

export default async function templateRoutes(fastify: FastifyInstance) {
    // Register multipart for the preview-image upload endpoint
    fastify.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

    fastify.addHook('preHandler', authenticate);
    /**
     * @route POST /api/v1/templates
     * @desc Creates a new Template and its first TemplateVersion
     */
    fastify.post('/', async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        const b = request.body as any;

        if (!workspaceId) {
            return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);
        }

        if (!b.name || !b.messageText) {
            return reply.sendError({ code: 'BAD_REQUEST', message: 'Name and messageText are required' }, 400);
        }

        // Validate variables against allowed namespaces
        try {
            validateMessageVariables(b.messageText);
        } catch (e: any) {
            return reply.sendError({ code: 'BAD_REQUEST', message: e.message || 'Invalid template variables' }, 400);
        }

        const wsForPlan = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { planTier: true },
        });
        const maxTemplates = PLAN_LIMITS[wsForPlan?.planTier || 'FREE'].maxTemplates;
        const currentTemplates = await prisma.template.count({ where: { workspaceId } });
        if (currentTemplates >= maxTemplates) {
             return reply.sendError({ message: `Template limit reached. Upgrade your plan to create more than ${maxTemplates} templates.`, code: 'PAYMENT_REQUIRED' }, 402);
        }

        // Start a transaction to ensure atomic creation of Root + Version 1
        const template = await prisma.$transaction(async (tx) => {
            const root = await tx.template.create({
                data: {
                    workspaceId,
                    name: b.name,
                    category: b.category,
                    language: b.language
                }
            });

            const version = await tx.templateVersion.create({
                data: {
                    templateId: root.id,
                    version: 1,
                    messageText: b.messageText,
                    footerText: b.footerText,
                    headerMediaId: b.headerMediaId || undefined,
                    buttons: {
                        create: (b.buttons || []).map((btn: any) => ({
                            type: btn.type,
                            label: btn.label,
                            payload: btn.payload
                        }))
                    }
                },
                include: { buttons: true }
            });

            return { ...root, versions: [version] };
        });

        return reply.sendSuccess(template, 201);
    });

    /**
     * @route PUT /api/v1/templates/:id/versions
     * @desc Saves an edit to an existing template by auto-incrementing to a NEW TemplateVersion
     */
    fastify.put('/:id/versions', async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        const { id: templateId } = request.params as { id: string };
        const b = request.body as any;

        if (!workspaceId) {
            return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);
        }

        if (!b.messageText) {
            return reply.sendError({ code: 'BAD_REQUEST', message: 'messageText is required' }, 400);
        }

        // Validate namespace variables
        try {
            validateMessageVariables(b.messageText);
        } catch (e: any) {
             return reply.sendError({ code: 'BAD_REQUEST', message: e.message || 'Invalid template variables' }, 400);
        }

        const template = await prisma.template.findUnique({
            where: { id: templateId, workspaceId } // Enforce workspace auth
        });

        if (!template) {
            return reply.sendError({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
        }

        // Create new version atomically
        const newVersion = await prisma.$transaction(async (tx) => {
            // Find max version to auto-increment
            const maxVersionRec = await tx.templateVersion.findFirst({
                where: { templateId },
                orderBy: { version: 'desc' },
                select: { version: true }
            });

            const nextVersionNum = (maxVersionRec?.version || 0) + 1;

            return await tx.templateVersion.create({
                data: {
                    templateId,
                    version: nextVersionNum,
                    messageText: b.messageText,
                    footerText: b.footerText,
                    headerMediaId: b.headerMediaId || undefined,
                    buttons: {
                        create: (b.buttons || []).map((btn: any) => ({
                            type: btn.type,
                            label: btn.label,
                            payload: btn.payload
                        }))
                    }
                },
                include: { buttons: true }
            });
        });

        return reply.sendSuccess(newVersion, 201);
    });

    /**
     * @route GET /api/v1/templates
     * @desc Lists all templates with their LATEST version embedded
     */
    fastify.get('/', async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        if (!workspaceId) {
            return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);
        }

        const templates = await prisma.template.findMany({
            where: { workspaceId },
            include: {
                versions: {
                    orderBy: { version: 'desc' },
                    take: 1, // Only send the latest version to the UI list
                    include: { buttons: true, media: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return reply.sendSuccess({ templates });
    });

    /**
     * @route GET /api/v1/templates/:id
     * @desc Fetch a specific template with ALL its historical versions
     */
    fastify.get('/:id', async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        const { id } = request.params as { id: string };

        if (!workspaceId) return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);

        const template = await prisma.template.findUnique({
            where: { id, workspaceId },
            include: {
                versions: {
                    orderBy: { version: 'desc' },
                    include: { buttons: true, media: true }
                }
            }
        });

        if (!template) return reply.sendError({ code: 'NOT_FOUND', message: 'Template not found' }, 404);

        return reply.sendSuccess(template);
    });

    /**
     * @route DELETE /api/v1/templates/:id
     * @desc Cascade deletes the template and all its versions
     */
    fastify.delete('/:id', async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        const { id } = request.params as { id: string };

        if (!workspaceId) return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);

        // Ensure it belongs to the workspace
        const exists = await prisma.template.findUnique({ where: { id, workspaceId } });
        if (!exists) return reply.sendError({ code: 'NOT_FOUND', message: 'Template not found' }, 404);

        await prisma.template.delete({ where: { id } });

        return reply.status(204).send();
    });

    /**
     * @route POST /api/v1/templates/:id/test
     * @desc Send a test message with the specified template using a connected WhatsApp session
     */
    fastify.post('/:id/test', async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        const { id } = request.params as { id: string };
        const b = request.body as any;
        const { sessionId, phoneNumber, variables } = b;

        if (!workspaceId) {
            return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);
        }

        if (!sessionId || !phoneNumber) {
            return reply.sendError({ code: 'BAD_REQUEST', message: 'sessionId and phoneNumber are required' }, 400);
        }

        const template = await prisma.template.findUnique({
            where: { id, workspaceId },
            include: {
                versions: {
                    orderBy: { version: 'desc' },
                    take: 1
                }
            }
        });

        if (!template || template.versions.length === 0) {
            return reply.sendError({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
        }

        const latestVersion = template.versions[0];
        const context = buildRenderContext(variables);

        // Ensure we have a conversation for this recipient
        const conversation = await createOrGetConversation(workspaceId, {
            provider: 'WHATSAPP',
            providerId: phoneNumber,
            sessionId: sessionId
        });

        // Use core messaging pipeline to dispatch
        await composeAndQueueMessage({
            workspaceId,
            conversationId: conversation.id,
            provider: 'WHATSAPP',
            providerId: phoneNumber,
            sessionId: sessionId,
            templateVersionId: latestVersion.id,
            templateVariables: context
        });

        return reply.sendSuccess({ message: 'Test message enqueued successfully' });
    });

    /**
     * @route POST /api/v1/templates/:id/preview-image
     * @desc Accepts a PNG snapshot (from html2canvas) and stores it as the template thumbnail.
     *       Creates a Media record and writes its URL back to templates.preview_image_url.
     *       Skips quota enforcement — preview images are internal assets (~30–80 KB each).
     */
    fastify.post('/:id/preview-image', async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        const { id: templateId } = request.params as { id: string };

        if (!workspaceId) {
            return reply.sendError({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized' }, 401);
        }

        // Verify ownership
        const template = await prisma.template.findUnique({
            where: { id: templateId, workspaceId },
            select: { id: true }
        });
        if (!template) {
            return reply.sendError({ code: 'NOT_FOUND', message: 'Template not found' }, 404);
        }

        const data = await request.file();
        if (!data) {
            return reply.sendError({ code: 'BAD_REQUEST', message: 'No file uploaded' }, 400);
        }

        const buffer = await data.toBuffer();
        const storageProvider = getStorageProvider();

        // Upload to storage using the standard pipeline
        const uploadResult = await storageProvider.upload(workspaceId, buffer, {
            filename: `template-preview-${templateId}.png`,
            mimeType: 'image/png',
            size: buffer.length,
        });

        // Create a Media record so the file is streamable via /media-gallery/:id/file
        const media = await prisma.media.create({
            data: {
                workspaceId,
                name: `template-preview-${templateId}.png`,
                storageProvider: 'local',
                storageKey: uploadResult.storageKey,
                url: uploadResult.url,
                type: 'image',
                mimeType: 'image/png',
                size: buffer.length,
                category: 'template_preview',
            }
        });

        // Build the authenticated streaming URL
        const apiBase = process.env.API_BASE_URL || 'http://localhost:3001/api/v1';
        const previewImageUrl = `${apiBase}/media-gallery/${media.id}/file`;

        // Persist the URL on the template root row
        await prisma.template.update({
            where: { id: templateId },
            data: { previewImageUrl }
        });

        return reply.sendSuccess({ previewImageUrl, mediaId: media.id });
    });
}
