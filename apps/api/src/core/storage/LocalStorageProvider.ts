import { promises as fs, createReadStream } from 'fs';
import { join, resolve } from 'path';
import { FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { IStorageProvider, UploadedFileMeta } from './IStorageProvider';
import { env } from '../../env';
import { createLogger } from '../logger';

const log = createLogger({ module: 'local-storage-provider' });

/**
 * Local filesytem storage provider for development and simple deployments.
 * Stores files in the configured MEDIA_DIR.
 */
export class LocalStorageProvider implements IStorageProvider {
    private baseDir: string;

    constructor() {
        this.baseDir = resolve(process.cwd(), env.MEDIA_DIR || 'uploads/media');
    }

    private getExt(filename: string, mimeType: string): string {
        const parts = filename.split('.');
        if (parts.length > 1) {
            return parts[parts.length - 1].toLowerCase();
        }
        return mimeType.split('/')[1]?.split(';')[0]?.trim() || 'bin';
    }

    async upload(
        workspaceId: string,
        fileBuffer: Buffer,
        meta: UploadedFileMeta
    ): Promise<{ storageKey: string; url: string }> {
        const uuid = randomUUID();
        const ext = this.getExt(meta.filename, meta.mimeType);
        
        // Standardized storage key format: workspaceId/media/{uuid}.{ext}
        const storageKey = `${workspaceId}/media/${uuid}.${ext}`;
        
        const absolutePath = join(this.baseDir, storageKey);
        const folderPath = join(this.baseDir, `${workspaceId}/media`);

        // Ensure directory exists
        await fs.mkdir(folderPath, { recursive: true });

        // Write file
        await fs.writeFile(absolutePath, fileBuffer);

        log.debug({ storageKey, size: meta.size }, 'File saved to local storage');

        // For local storage, the URL just points back to our own secure streaming endpoint
        // The actual ID isn't known here yet (DB entity not created), but the router handles
        // proxying the DB `url` field anyway. We just return a placeholder or relative path.
        // In local dev, the frontend will actually hit `/api/v1/media-gallery/:id/file` 
        // to view it.
        const url = `/local-media-placeholder/${storageKey}`;

        return { storageKey, url };
    }

    async delete(storageKey: string): Promise<void> {
        const absolutePath = join(this.baseDir, storageKey);
        try {
            await fs.unlink(absolutePath);
            log.debug({ storageKey }, 'File deleted from local storage');
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                log.warn({ storageKey }, 'File not found during delete operation');
                return; // Nothing to delete
            }
            throw error;
        }
    }

    async getUrl(storageKey: string): Promise<string> {
        // Local storage doesn't really have public URLs, we rely on the API stream endpoint.
        return `/local-media-placeholder/${storageKey}`;
    }

    async streamToResponse(storageKey: string, reply: FastifyReply): Promise<void> {
        const absolutePath = join(this.baseDir, storageKey);
        
        // Prevent path traversal attacks
        if (!absolutePath.startsWith(this.baseDir)) {
            reply.status(403).send({ error: 'Permission Denied', message: 'Invalid storage key' });
            return;
        }

        try {
            const stat = await fs.stat(absolutePath);
            
            // Fastify handles the rest natively if we pass a stream
            const stream = createReadStream(absolutePath);
            reply.header('Content-Length', stat.size);
            return reply.send(stream);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                reply.status(404).send({ error: 'Not Found', message: 'Media file not found on disk' });
                return;
            }
            log.error({ err: error, storageKey }, 'Error streaming local file');
            reply.status(500).send({ error: 'Internal Server Error' });
            return;
        }
    }
}
