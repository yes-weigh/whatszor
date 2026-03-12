import { FastifyReply } from 'fastify';

/**
 * Standardized metadata extracted from an uploaded file
 */
export interface UploadedFileMeta {
    filename: string;
    mimeType: string;
    size: number;
}

/**
 * The standard interface for Media Gallery storage providers.
 * All providers (Local, S3, GCS) must implement this to ensure
 * the rest of the application remains agnostic to the underlying storage.
 */
export interface IStorageProvider {
    /**
     * Upload a file and return its permanent storage key and public/signed URL
     */
    upload(
        workspaceId: string,
        fileBuffer: Buffer,
        meta: UploadedFileMeta
    ): Promise<{ storageKey: string; url: string }>;

    /**
     * Delete a file from storage using its storage key
     */
    delete(storageKey: string): Promise<void>;

    /**
     * Get a direct URL for a storage key (used for CDN or signed short-lived URLs)
     */
    getUrl(storageKey: string): Promise<string>;

    /**
     * Stream a file directly to the Fastify reply response
     * Used exclusively by the secure `GET /api/v1/media-gallery/:id/file` endpoint
     * to enforce workspace auth before handing over the bytes.
     */
    streamToResponse(storageKey: string, reply: FastifyReply): Promise<void>;
}
