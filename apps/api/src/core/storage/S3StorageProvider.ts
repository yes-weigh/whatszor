import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../env';
import { IStorageProvider } from './IStorageProvider';

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

    async uploadBuffer(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: filename,
            Body: buffer,
            ContentType: mimeType,
        });

        await this.client.send(command);
        return filename;
    }

    async getSignedUrl(filename: string, expiresInSeconds: number = 3600): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filename,
        });

        // Use AWS SDK presigner
        return await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    }

    async deleteFile(filename: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: filename,
        });

        await this.client.send(command);
    }
}
