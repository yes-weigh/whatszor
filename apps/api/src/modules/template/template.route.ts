import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma/client';
import { ErrorCodes } from '@whatszor/shared';
import { validateMessageVariables } from './template-renderer';
import { authenticate } from '../../middleware/authenticate';

export default async function templateRoutes(fastify: FastifyInstance) {
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
}
