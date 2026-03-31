import pino from 'pino';
import { env } from '../env';
import { requestContext } from './context';
import crypto from 'node:crypto';

const transport =
    env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        }
        : undefined;

/**
 * Global structured logger (Pino).
 * Use createLogger() for module-specific loggers with automatic trace injection.
 */
export const logger = pino(
    {
        level: env.LOG_LEVEL,
        base: {
            service: env.SERVICE_NAME,
            env: env.NODE_ENV,
            role: env.CONTAINER_ROLE,
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
            paths: [
                // HTTP headers
                'req.headers.authorization',
                'req.headers.cookie',
                // Top-level scalar fields
                'password',
                'token',
                'accessToken',
                'refreshToken',
                'secret',
                'apiKey',
                // Nested wildcards — covers service payloads, job data, etc.
                '*.password',
                '*.token',
                '*.accessToken',
                '*.refreshToken',
                '*.secret',
                '*.apiKey',
                '*.JWT_SECRET',
                '*.AWS_SECRET_ACCESS_KEY',
                '*.AWS_ACCESS_KEY_ID',
            ],
            censor: '[REDACTED]',
        },
    },
    transport ? pino.transport(transport) : undefined,
);

export interface LoggerContext {
    module: string;
    action?: string;
    traceId?: string;
    workspaceId?: string;
    [key: string]: any;
}

/**
 * Creates a structured child logger with enforced contextual fields.
 * Automatically resolves `traceId` and `workspaceId` from AsyncLocalStorage
 * if not explicitly provided, ensuring every log line is traceable.
 *
 * ⚠️  ALWAYS use `createLogger()` — never call `logger.child()` directly.
 *     Direct `.child()` calls bypass traceId + workspaceId injection.
 *
 * Usage:
 *   const log = createLogger({ module: 'messaging', action: 'send' });
 *   log.info({ conversationId }, 'Sending message');
 */
export function createLogger(context: LoggerContext): pino.Logger {
    const { traceId: explicitTraceId, workspaceId: explicitWorkspaceId, ...rest } = context;

    return logger.child({
        ...rest,
        get traceId(): string {
            return explicitTraceId
                || requestContext.getStore()?.traceId
                || `tr-fallback-${crypto.randomBytes(4).toString('hex')}`;
        },
        get workspaceId(): string | undefined {
            return explicitWorkspaceId || requestContext.getStore()?.workspaceId;
        },
    });
}
