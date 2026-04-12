import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma/client';
import { getStorageProvider } from '../../core/storage';
import { ErrorCodes } from '@whatszor/shared';
import multipart from '@fastify/multipart';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/require-role';
import { resolveStorageLimit } from '../../core/config/storage';


const MAX_IMAGE_SIZE = 10 * 1024 * 1024;  // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_DOC_SIZE = 100 * 1024 * 1024;   // 100MB

export default async function mediaGalleryRoutes(fastify: FastifyInstance) {
    // Register multipart plugin for file uploads
    fastify.register(multipart, {
        limits: {
            fileSize: MAX_VIDEO_SIZE, // Max allowed across all types is 20MB
        }
    });

    const storageProvider = getStorageProvider();

    /**
     * Internal handler for media uploads to avoid logic duplication
     * Supports both POST / and POST /upload
     */
    const handleUpload = async (request: any, reply: any) => {
        const workspaceId = request.user?.workspaceId;
        if (!workspaceId) {
            return reply.sendError({ message: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED }, 401);
        }

        const data = await request.file();
        
        if (!data) {
             return reply.sendError({ message: 'No file uploaded', code: 'BAD_REQUEST' }, 400);
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
             return reply.sendError({ 
                 message: `File size exceeds the limit for ${type}. Max allowed is ${maxSize / (1024*1024)}MB.`,
                 code: 'BAD_REQUEST'
             }, 400);
        }

        // ── Atomic Storage Quota Enforcement ──────────────────────────────────────
        // Resolve quota limit from plan first (needs planTier + storageLimitBytes).
        const wsForPlan = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { planTier: true, storageLimitBytes: true },
        });
        if (!wsForPlan) {
            return reply.sendError({ message: 'Workspace not found', code: ErrorCodes.NOT_FOUND }, 404);
        }
        const storageLimit = resolveStorageLimit(wsForPlan.planTier, wsForPlan.storageLimitBytes);
        const fileSize = BigInt(buffer.length);

        // Atomic compare-and-swap: increment ONLY if quota allows. No separate read.
        // If the workspace is over-limit, 0 rows are updated and we return 413.
        const result = await prisma.$executeRaw`
            UPDATE workspaces
            SET storage_used_bytes = storage_used_bytes + ${fileSize}
            WHERE id = ${workspaceId}
              AND storage_used_bytes + ${fileSize} <= ${storageLimit}
        `;

        if (result === 0) {
            // Re-read current usage only for the error message (non-critical path)
            const wsForMsg = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { storageUsedBytes: true },
            });
            const usedMB = Number(wsForMsg?.storageUsedBytes ?? 0n) / (1024 * 1024);
            const limitMB = Number(storageLimit) / (1024 * 1024);
            return reply.sendError({
                message: `Storage quota exceeded. Used ${usedMB.toFixed(1)} MB of ${limitMB.toFixed(0)} MB (${wsForPlan.planTier} plan). Delete some media to free space.`,
                code: 'STORAGE_QUOTA_EXCEEDED',
            }, 413);
        }
        // ─────────────────────────────────────────────────────────────────────────

        const category = (data.fields.category as any)?.value || null;
        const language = (data.fields.language as any)?.value || null;

        let uploadResult: Awaited<ReturnType<typeof storageProvider.upload>>;
        let media: any;
        try {
            uploadResult = await storageProvider.upload(workspaceId, buffer, {
                filename: data.filename,
                mimeType,
                size: buffer.length
            });

            // Create the media record. The quota was already incremented above atomically.
            media = await prisma.media.create({
                data: {
                    workspaceId,
                    name: data.filename,
                    storageProvider: 'local',
                    storageKey: uploadResult.storageKey,
                    url: uploadResult.url,
                    type,
                    mimeType,
                    size: buffer.length,
                    category,
                    language
                }
            });
        } catch (uploadErr) {
            // Upload or DB write failed — roll back the storage counter we already incremented.
            await prisma.$executeRaw`
                UPDATE workspaces
                SET storage_used_bytes = GREATEST(0, storage_used_bytes - ${fileSize})
                WHERE id = ${workspaceId}
            `;
            throw uploadErr;
        }

        return reply.sendSuccess(media, 201);
    };

    /**
     * @route POST /api/v1/media-gallery
     * @route POST /api/v1/media-gallery/upload
     * @desc Uploads a new media asset (Supports legacy /upload path)
     */
    fastify.post('/', { preHandler: [authenticate, requireRole('media:manage')] }, handleUpload);
    fastify.post('/upload', { preHandler: [authenticate, requireRole('media:manage')] }, handleUpload);

    /**
     * @route GET /api/v1/media-gallery
     * @desc List media assets with optional filtering
     */
    fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
        const workspaceId = request.user?.workspaceId;
        if (!workspaceId) {
            return reply.sendError({ message: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED }, 401);
        }

        const query = request.query as any;
        const type = query.type as string | undefined;
        const category = query.category as string | undefined;
        const search = query.search as string | undefined;

        const where: any = { workspaceId };
        
        if (type) where.type = type;
        
        // Hide internal template previews by default unless explicitly requested
        if (category) {
            where.category = category;
        } else {
            where.category = { not: 'template_preview' };
        }
        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }

        const media = await prisma.media.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        return reply.sendSuccess({ media });
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
            return reply.sendError({ message: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED }, 401);
        }

        const media = await prisma.media.findUnique({
            where: { id, workspaceId } // STRICT workspace isolation
        });

        if (!media) {
            return reply.sendError({ message: 'Media not found or unauthorized', code: 'NOT_FOUND' }, 404);
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
            return reply.sendError({ message: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED }, 401);
        }

        const media = await prisma.media.findUnique({
            where: { id, workspaceId }
        });

        if (!media) {
            return reply.sendError({ message: 'Media not found', code: 'NOT_FOUND' }, 404);
        }

        // Delete from storage backend
        await storageProvider.delete(media.storageKey);

        // Delete from DB and decrement storage usage atomically.
        // MAX guard prevents storageUsedBytes from going negative (e.g. after a backfill or manual DB edit).
        const fileSize = BigInt(media.size ?? 0);
        await prisma.$transaction(async (tx) => {
            await tx.media.delete({ where: { id } });
            const ws = await tx.workspace.findUnique({
                where: { id: workspaceId },
                select: { storageUsedBytes: true },
            });
            if (ws) {
                const newUsed = ws.storageUsedBytes - fileSize;
                await tx.workspace.update({
                    where: { id: workspaceId },
                    // clamp to 0 to prevent negative bytes (safety guard)
                    data: { storageUsedBytes: newUsed < 0n ? 0n : newUsed },
                });
            }
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
            return reply.sendError({ message: 'Unauthorized', code: ErrorCodes.UNAUTHORIZED }, 401);
        }

        // Make sure it belongs to workspace
        const existing = await prisma.media.findUnique({
            where: { id, workspaceId }
        });

        if (!existing) {
             return reply.sendError({ message: 'Media not found', code: 'NOT_FOUND' }, 404);
        }

        const data: any = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.category !== undefined) data.category = body.category;
        if (body.language !== undefined) data.language = body.language;

        const updated = await prisma.media.update({
            where: { id },
            data
        });

        return reply.sendSuccess(updated);
    });
}
