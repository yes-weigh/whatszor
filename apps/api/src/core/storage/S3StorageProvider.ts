import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../env';
import { IStorageProvider, UploadedFileMeta } from './IStorageProvider';
import crypto from 'crypto';
import { FastifyReply } from 'fastify';

export class S3StorageProvider implements IStorageProvider {
    private client: S3Client;
    private bucket: string;

    constructor() {
        if (!env.S3_BUCKET || !env.S3_REGION) {
            throw new Error('S3_BUCKET and S3_REGION must be configured when STORAGE_PROVIDER=s3');
        }

        this.bucket = env.S3_BUCKET;
        this.client = new S3Client({
            region: env.S3_REGION,
            credentials:
                env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
                    ? {
                          accessKeyId: env.AWS_ACCESS_KEY_ID,
                          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
                      }
                    : undefined, // Relies on IAM roles if not provided
        });
    }

    async upload(
        workspaceId: string,
        fileBuffer: Buffer,
        meta: UploadedFileMeta
    ): Promise<{ storageKey: string; url: string }> {
        const uuid = crypto.randomUUID();
        const ext = meta.filename.split('.').pop() || meta.mimeType.split('/')[1] || 'bin';
        const storageKey = `${workspaceId}/media/${uuid}.${ext}`;

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
            Body: fileBuffer,
            ContentType: meta.mimeType,
        });

        await this.client.send(command);

        const url = await this.getUrl(storageKey);
        return { storageKey, url };
    }

    async getUrl(storageKey: string): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
        });

        return await getSignedUrl(this.client, command, { expiresIn: 3600 });
    }

    async delete(storageKey: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
        });

        await this.client.send(command);
    }

    async streamToResponse(storageKey: string, reply: FastifyReply): Promise<void> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
        });

        try {
            const response = await this.client.send(command);
            if (!response.Body) {
                reply.status(404).send({ error: 'Not Found', message: 'Media file body empty in S3' });
                return;
            }

            if (response.ContentType) {
                reply.header('Content-Type', response.ContentType);
            }
            if (response.ContentLength) {
                reply.header('Content-Length', response.ContentLength);
            }

            return reply.send(response.Body as any);
        } catch (error: any) {
            if (error.name === 'NoSuchKey') {
                reply.status(404).send({ error: 'Not Found', message: 'Media file not found in S3' });
                return;
            }
            throw error;
        }
    }
}
