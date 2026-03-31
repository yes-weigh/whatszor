import {
    FastifyError,
    FastifyReply,
    FastifyRequest,
} from 'fastify';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';
import { AppError } from './errors';

/**
 * Global Fastify error handler.
 *
 * Uses `request.log` instead of the global `logger` so that every error log
 * automatically carries the request's `traceId` and `workspaceId` from ALS.
 *
 * Severity strategy:
 *   - 4xx: warn  — client mistake, not a system failure
 *   - 5xx: error — unexpected; needs investigation
 */
export function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
): void {
    const baseContext = {
        traceId: (request as any).traceId,
        method: request.method,
        url: request.url,
        workspaceId: (request.user as any)?.workspaceId,
        code: (error as any).code,
        statusCode: (error as any).statusCode ?? 500,
    };

    // ── Zod validation errors ───────────────────────────────────────────────
    if (error instanceof ZodError) {
        import('fs').then(fs => fs.appendFileSync('c:/whatszor-err.txt', 'ZodError: ' + JSON.stringify({ url: request.url, message: error.message, stack: error.stack }) + '\n')).catch(()=>null);
        request.log.warn(
            { ...baseContext, validationErrors: error.flatten().fieldErrors },
            'Zod validation failed',
        );
        reply.code(422).sendError({
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: error.flatten().fieldErrors,
        }, 422);
        return;
    }

    // ── Fastify native schema validation errors ─────────────────────────────
    if (error.validation) {
        import('fs').then(fs => fs.appendFileSync('c:/whatszor-err.txt', 'SchemaError: ' + JSON.stringify({ url: request.url, message: error.message, stack: error.stack }) + '\n')).catch(()=>null);
        request.log.warn(
            { ...baseContext, validationErrors: error.validation },
            'Request schema validation failed',
        );
        reply.code(422).sendError({
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.validation,
        }, 422);
        return;
    }

    // ── Typed AppError — services throw these for known business failures ────
    if (error instanceof AppError) {
        import('fs').then(fs => fs.appendFileSync('c:/whatszor-err.txt', 'AppError: ' + JSON.stringify({ url: request.url, message: error.message, stack: error.stack }) + '\n')).catch(()=>null);
        const level = error.statusCode < 500 ? 'warn' : 'error';
        request.log[level](
            { ...baseContext, code: error.code, statusCode: error.statusCode },
            `AppError: ${error.message}`,
        );
        reply.code(error.statusCode).sendError({
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
        }, error.statusCode);
        return;
    }

    // ── Known HTTP errors (4xx) — client mistakes ───────────────────────────
    if (error.statusCode && error.statusCode < 500) {
        import('fs').then(fs => fs.appendFileSync('c:/whatszor-err.txt', '4xx: ' + JSON.stringify({ url: request.url, message: error.message, stack: error.stack }) + '\n')).catch(()=>null);
        request.log.warn(
            { ...baseContext, err: error.message },
            'Client error',
        );
        reply.code(error.statusCode).sendError({
            code: (error.code as string) || 'CLIENT_ERROR',
            message: error.message,
        }, error.statusCode);
        return;
    }

    // ── Unexpected server errors (5xx) ──────────────────────────────────────
    import('fs').then(fs => fs.appendFileSync('c:/whatszor-err.txt', JSON.stringify({ url: request.url, message: error.message, stack: error.stack }) + '\n')).catch(()=>null);
    request.log.error(
        { ...baseContext, err: error.message, stack: error.stack },
        'Unhandled server error',
    );
    Sentry.captureException(error);
    reply.code(500).sendError({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again later.',
    }, 500);
}
