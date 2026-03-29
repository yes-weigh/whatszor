import pino from 'pino';
import { env } from '../env';

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
 * Use child loggers inside modules for structured context:
 *   const log = logger.child({ module: 'crm' });
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
    },
    transport ? pino.transport(transport) : undefined,
);

/** Helper to add trace contextual metadata. */
export const withTrace = (traceId: string) => logger.child({ traceId });

