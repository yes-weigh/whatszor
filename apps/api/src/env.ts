import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
    // Application
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.string().default('3001').transform(Number),
    API_URL: z.string().url(),

    // Google Gemini API Key
    GEMINI_API_KEY: z.string().min(1),

    // Database
    DATABASE_URL: z.string().min(1),

    // Redis
    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    // Authentication
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

    // CORS
    CORS_ORIGIN: z.string().default('http://localhost:3000'),

    // Logging
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // Media Storage — local disk path for downloaded inbound WhatsApp media
    MEDIA_DIR: z.string().default('./media'),

    // Sentry config
    SENTRY_DSN: z.string().optional(),

    // Health monitoring
    HEALTH_SECRET: z.string().default('dev-health-secret'),

    // Production Configs
    REDIS_PASSWORD: z.string().optional(),
    REDIS_TLS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    DATABASE_CONNECTION_LIMIT: z.string().default('10').transform(Number),
    RATE_LIMIT_MAX: z.string().default('300').transform(Number),
    RATE_LIMIT_WINDOW: z.string().default('1 minute'),

    // S3 Storage
    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
});

function parseEnv() {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        const messages = Object.entries(errors)
            .map(([key, msgs]) => `  ${key}: ${msgs?.join(', ')}`)
            .join('\n');

        console.error('❌ Invalid environment variables:\n' + messages);
        process.exit(1);
    }

    return result.data;
}

// Parse and export env — fails fast at startup if config is invalid
export const env = parseEnv();

export type Env = z.infer<typeof envSchema>;
