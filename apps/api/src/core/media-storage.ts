/**
 * media-storage.ts — Saves WhatsApp media buffers to local disk.
 *
 * Storage layout:
 *   {MEDIA_DIR}/{workspaceId}/{messageId}.{ext}
 *
 * The directory is created on first write. In a future scale-up, swap
 * the writeFile call for an S3/GCS upload and store the object URL instead.
 */

import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { env } from '../env';
import { createLogger } from './logger';

const log = createLogger({ module: 'media-storage' });

/** Maps common MIME types to file extensions. */
const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/3gpp': '3gp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg; codecs=opus': 'ogg',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function extFromMime(mimeType: string): string {
    // Strip codec qualifiers for lookup: "audio/ogg; codecs=opus" → "audio/ogg; codecs=opus" (keep full for exact match first)
    return MIME_TO_EXT[mimeType]
        ?? MIME_TO_EXT[mimeType.split(';')[0].trim()]
        ?? mimeType.split('/')[1]?.split(';')[0]?.trim()
        ?? 'bin';
}

export interface SavedMedia {
    localPath: string;  // Absolute path on disk
    mimeType: string;
    fileSize: number;
}

/**
 * Write a media buffer to disk for a specific message.
 * Returns the absolute path and file metadata.
 */
export async function saveMedia(
    buffer: Buffer,
    meta: { workspaceId: string; messageId: string; mimeType: string }
): Promise<SavedMedia> {
    const { workspaceId, messageId, mimeType } = meta;
    const ext = extFromMime(mimeType);

    const baseDir = resolve(process.cwd(), env.MEDIA_DIR);
    const workspaceDir = join(baseDir, workspaceId);

    // Ensure directory exists (no-op if already created)
    await fs.mkdir(workspaceDir, { recursive: true });

    const filename = `${messageId}.${ext}`;
    const localPath = join(workspaceDir, filename);

    await fs.writeFile(localPath, buffer);

    log.debug({ localPath, fileSize: buffer.byteLength, mimeType }, 'Media saved to disk');

    return { localPath, mimeType, fileSize: buffer.byteLength };
}

/**
 * Stream a previously saved media file.
 * Returns `null` if the file does not exist (caller should return 404).
 */
export async function getMediaPath(localPath: string): Promise<boolean> {
    try {
        await fs.access(localPath);
        return true;
    } catch {
        return false;
    }
}
