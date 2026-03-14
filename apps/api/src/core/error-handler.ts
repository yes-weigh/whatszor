import {
    FastifyError,
    FastifyReply,
    FastifyRequest,
} from 'fastify';
import { ZodError } from 'zod';
import { logger } from './logger';
import * as Sentry from '@sentry/node';

export function errorHandler(
    error: FastifyError,
    _request: FastifyRequest,
    reply: FastifyReply,
): void {
    // Zod validation errors from @fastify/sensible or manual parsing
    if (error instanceof ZodError) {
        logger.error({ validationErrors: error.flatten().fieldErrors }, 'Zod validation failed');
        reply.status(422).send({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: error.flatten().fieldErrors,
            },
        });
        return;
    }

    // Fastify's native validation errors
    if (error.validation) {
        reply.status(422).send({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: error.validation,
            },
        });
        return;
    }

    // Known HTTP errors (from @fastify/sensible)
    if (error.statusCode && error.statusCode < 500) {
        reply.status(error.statusCode).send({
            success: false,
            error: {
                code: error.code || 'CLIENT_ERROR',
                message: error.message,
            },
        });
        return;
    }

    // Unexpected server errors — log and hide internals
    logger.error({ err: error }, 'Unhandled server error');
    Sentry.captureException(error);
    reply.status(500).send({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred. Please try again later.',
        },
    });
}
