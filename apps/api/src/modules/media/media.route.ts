/**
 * media.route.ts — Serve and on-demand download of WhatsApp media files
 *
 * GET  /api/v1/media/:messageId          — stream saved file from disk
 * POST /api/v1/media/:messageId/download  — on-demand download for historical messages
 */

import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import { authenticate } from '../../middleware/authenticate';
import { prisma } from '../../prisma/client';
import { getMediaPath, saveMedia } from '../../core/media-storage';
import { createLogger } from '../../core/logger';
import { downloadMediaMessage } from '@itsukichan/baileys';
import { waManager } from '../whatsapp/whatsapp.service';

const log = createLogger({ module: 'media-route' });

export async function mediaRoutes(fastify: FastifyInstance) {

    // ── GET /:messageId — stream saved file ───────────────────────────────
    fastify.get<{ Params: { messageId: string } }>(
        '/:messageId',
        { 
            preHandler: [authenticate],
            config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
        },
        async (request, reply) => {
            const { messageId } = request.params;
            const { workspaceId } = request.user;

            const msg = await (prisma.message as any).findFirst({
                where: { id: messageId, conversation: { workspaceId } },
                select: { id: true, mediaData: true, type: true },
            });

            if (!msg) {
                return reply.sendError({ code: 'NOT_FOUND', message: 'Message not found' }, 404);
            }

            const mediaData = msg.mediaData as Record<string, any> | null;
            const localPath: string | undefined = mediaData?.localPath;

            if (!localPath) {
                return reply.sendError({ code: 'NO_MEDIA', message: 'No local media file. Use POST /download to fetch it.' }, 404);
            }

            const exists = await getMediaPath(localPath);
            if (!exists) {
                log.warn({ messageId, localPath }, 'Media file missing from disk');
                return reply.sendError({ code: 'FILE_NOT_FOUND', message: 'Media file not found on server' }, 404);
            }

            const mimeType = (mediaData?.mimeType as string | undefined) || 'application/octet-stream';
            const fileSize = (mediaData?.fileSize as number | undefined);

            const headers: Record<string, string | number> = {
                'Content-Type': mimeType,
                'Cache-Control': 'private, max-age=86400',
            };
            if (fileSize) headers['Content-Length'] = fileSize;

            reply.raw.writeHead(200, headers);
            createReadStream(localPath).pipe(reply.raw);

            await new Promise<void>((resolve) => {
                reply.raw.on('finish', resolve);
                reply.raw.on('error', resolve);
            });
        }
    );

    // ── POST /:messageId/download — on-demand download for historical media ──
    //
    // For messages where automatic download failed (or messages received before
    // the media pipeline existed), the client triggers this endpoint.
    // It reconstructs a minimal WAMessage from stored DB fields, calls
    // downloadMediaMessage(), saves to disk, patches the DB record, and returns
    // the binary blob — so the client can display it immediately.
    fastify.post<{ Params: { messageId: string } }>(
        '/:messageId/download',
        { 
            preHandler: [authenticate],
            config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
        },
        async (request, reply) => {
            const { messageId } = request.params;
            const { workspaceId } = request.user;

            const msg = await (prisma.message as any).findFirst({
                where: { id: messageId, conversation: { workspaceId } },
                select: {
                    id: true,
                    remoteId: true,
                    direction: true,
                    type: true,
                    mediaData: true,
                    conversation: {
                        select: { providerId: true, sessionId: true },
                    },
                },
            });

            if (!msg) {
                return reply.sendError({ code: 'NOT_FOUND', message: 'Message not found' }, 404);
            }

            const mediaData = msg.mediaData as Record<string, any> | null;
            if (!mediaData) {
                return reply.sendError({ code: 'NO_MEDIA_DATA', message: 'Message has no media data' }, 400);
            }

            // If already on disk, stream it directly — no re-download needed
            if (mediaData.localPath) {
                const exists = await getMediaPath(mediaData.localPath);
                if (exists) {
                    const mimeType = (mediaData.mimeType as string) || 'application/octet-stream';
                    reply.raw.writeHead(200, {
                        'Content-Type': mimeType,
                        'Cache-Control': 'private, max-age=86400',
                    });
                    createReadStream(mediaData.localPath).pipe(reply.raw);
                    await new Promise<void>((resolve) => {
                        reply.raw.on('finish', resolve);
                        reply.raw.on('error', resolve);
                    });
                    return;
                }
            }

            // Verify an active socket is available for this workspace/session
            const sessionId = msg.conversation?.sessionId;
            const socket = sessionId
                ? (waManager.getSocket(sessionId) || waManager.getSocket(workspaceId))
                : waManager.getSocket(workspaceId);

            if (!socket) {
                return reply.sendError({ code: 'SESSION_OFFLINE', message: 'WhatsApp session is not connected' }, 503);
            }

            // Reconstruct a minimal WAMessage.
            // downloadMediaMessage() only needs key.remoteJid, key.id, key.fromMe, and message (IMessage).
            // All of these are stored in the DB.
            const waMessage = {
                key: {
                    remoteJid: msg.conversation.providerId,
                    id: msg.remoteId,
                    fromMe: msg.direction === 'OUTBOUND',
                },
                message: mediaData as any,
            };

            try {
                const buffer = await downloadMediaMessage(waMessage as any, 'buffer', {}) as Buffer;

                const mimeType: string =
                    mediaData.imageMessage?.mimetype
                    || mediaData.videoMessage?.mimetype
                    || mediaData.audioMessage?.mimetype
                    || mediaData.documentMessage?.mimetype
                    || 'application/octet-stream';

                const saved = await saveMedia(buffer, {
                    workspaceId,
                    messageId: msg.id,
                    mimeType,
                });

                const fileName = mediaData.documentMessage?.fileName ?? undefined;

                // Persist the localPath so future GETs serve from disk without re-downloading
                await prisma.message.update({
                    where: { id: msg.id },
                    data: {
                        mediaData: {
                            ...mediaData as object,
                            localPath: saved.localPath,
                            mimeType: saved.mimeType,
                            fileSize: saved.fileSize,
                            ...(fileName ? { fileName } : {}),
                        } as any,
                    },
                });

                log.info({ messageId: msg.id, localPath: saved.localPath }, 'On-demand media downloaded and saved');

                // Return the binary directly — client does URL.createObjectURL() immediately
                reply.raw.writeHead(200, {
                    'Content-Type': mimeType,
                    'Content-Length': buffer.byteLength,
                    'Cache-Control': 'private, max-age=86400',
                });
                reply.raw.end(buffer);

            } catch (err) {
                log.warn({ err, messageId: msg.id }, 'On-demand media download failed');
                return reply.sendError({ code: 'DOWNLOAD_FAILED', message: 'WhatsApp media download failed — URL may have expired' }, 502);
            }
        }
    );
}
