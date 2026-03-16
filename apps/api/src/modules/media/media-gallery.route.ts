import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma/client';
import { getStorageProvider } from '../../core/storage';
import { ErrorCodes } from '@whatszor/shared';
import multipart from '@fastify/multipart';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;   // 5MB
const MAX_VIDEO_SIZE = 20 * 1024 * 1024;  // 20MB
const MAX_DOC_SIZE = 10 * 1024 * 1024;    // 10MB

export default async function mediaGalleryRoutes(fastify: FastifyInstance) {
    // Register multipart plugin for file uploads
    fastify.register(multipart, {
        limits: {
            fileSize: MAX_VIDEO_SIZE, // Max allowed across all types is 20MB
        }
    });

    const storageProvider = getStorageProvider();

    /**
     * @route POST /api/v1/media-gallery
     * @desc Uploads a new media asset
     */
    fastify.post('/', { preHandler: [authenticate, requireRole('media:manage')] }, async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        if (!workspaceId) {
            return reply.status(401).send({ error: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED });
        }

        const data = await request.file();
        
        if (!data) {
             return reply.status(400).send({ error: 'Bad Request', message: 'No file uploaded' });
        }

        const mimeType = data.mimetype;
        let type = 'document';
        let maxSize = MAX_DOC_SIZE;

        if (mimeType.startsWith('image/')) {
            type = 'image';
            maxSize = MAX_IMAGE_SIZE;
        } else if (mimeType.startsWith('video/')) {
            type = 'video';
            maxSize = MAX_VIDEO_SIZE;
        }

        const buffer = await data.toBuffer();
        
        if (buffer.length > maxSize) {
             return reply.status(400).send({ 
                 error: 'Bad Request', 
                 message: `File size exceeds the limit for ${type}. Max allowed is ${maxSize / (1024*1024)}MB.`
             });
        }

        // We can parse fields. Note: in real multipart, fields are accessed via `data.fields` 
        // Example: Category, language parsing if sent alongside the file in FormData.
        const category = (data.fields.category as any)?.value || null;
        const language = (data.fields.language as any)?.value || null;

        const uploadResult = await storageProvider.upload(workspaceId, buffer, {
            filename: data.filename,
            mimeType,
            size: buffer.length
        });

        const media = await prisma.media.create({
            data: {
                workspaceId,
                name: data.filename, // Default name to filename, can be PATCHed later
                storageProvider: 'local', // Assuming local for now, could be dynamic
                storageKey: uploadResult.storageKey,
                url: uploadResult.url,
                type,
                mimeType,
                size: buffer.length,
                category,
                language
            }
        });

        // Optional hooks for background processing (BullMQ) could be triggered here
        // e.g. await mediaProcessingQueue.add('generate-thumbnail', { mediaId: media.id });

        return reply.status(201).send(media);
    });

    /**
     * @route GET /api/v1/media-gallery
     * @desc List media assets with optional filtering
     */
    fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        if (!workspaceId) {
            return reply.status(401).send({ error: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED });
        }

        const query = request.query as any;
        const type = query.type as string | undefined;
        const category = query.category as string | undefined;
        const search = query.search as string | undefined;

        const where: any = { workspaceId };
        
        if (type) where.type = type;
        if (category) where.category = category;
        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }

        const media = await prisma.media.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        return reply.send({ media });
    });

    /**
     * @route GET /api/v1/media-gallery/:id/file
     * @desc Securely streams actual file bytes. Accepts ?token= query parameter for <img> tags.
     */
    fastify.get('/:id/file', {
        preHandler: [
            async (request, _reply) => {
                const qs = request.query as Record<string, string>;
                if (qs.token && !request.headers.authorization) {
                    request.headers.authorization = `Bearer ${qs.token}`;
                }
            },
            authenticate,
        ]
    }, async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        const { id } = request.params as { id: string };

        if (!workspaceId) {
            return reply.status(401).send({ error: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED });
        }

        const media = await prisma.media.findUnique({
            where: { id, workspaceId } // STRICT workspace isolation
        });

        if (!media) {
            return reply.status(404).send({ error: 'Not Found', message: 'Media not found or unauthorized' });
        }

        // Let the storage adapter handle resolving the correct path and streaming
        // The adapter automatically sets Content-Length and pipes the stream to the reply
        
        // Ensure Fastify does not send a default Content-Type which may overwrite our manual sending
        if (media.mimeType) {
            reply.type(media.mimeType);
        }

        await storageProvider.streamToResponse(media.storageKey, reply);
    });

    /**
     * @route DELETE /api/v1/media-gallery/:id
     * @desc Deletes the media via the adapter and from the DB.
     */
    fastify.delete('/:id', { preHandler: [authenticate, requireRole('media:manage')] }, async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        const { id } = request.params as { id: string };

        if (!workspaceId) {
            return reply.status(401).send({ error: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED });
        }

        const media = await prisma.media.findUnique({
            where: { id, workspaceId }
        });

        if (!media) {
            return reply.status(404).send({ error: 'Not Found', message: 'Media not found' });
        }

        // Delete from storage
        await storageProvider.delete(media.storageKey);

        // Delete from DB
        await prisma.media.delete({
            where: { id }
        });

        return reply.status(204).send();
    });

    /**
     * @route PATCH /api/v1/media-gallery/:id
     * @desc Updates inline editable metadata
     */
    fastify.patch('/:id', { preHandler: [authenticate, requireRole('media:manage')] }, async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        const { id } = request.params as { id: string };
        const body = request.body as any;

        if (!workspaceId) {
            return reply.status(401).send({ error: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED });
        }

        // Make sure it belongs to workspace
        const existing = await prisma.media.findUnique({
            where: { id, workspaceId }
        });

        if (!existing) {
             return reply.status(404).send({ error: 'Not Found' });
        }

        const data: any = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.category !== undefined) data.category = body.category;
        if (body.language !== undefined) data.language = body.language;

        const updated = await prisma.media.update({
            where: { id },
            data
        });

        return reply.send(updated);
    });
}
