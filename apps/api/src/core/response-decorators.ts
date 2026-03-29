import { FastifyInstance, FastifyReply } from 'fastify';
import { ApiResponse, ApiError } from '@whatszor/shared';

declare module 'fastify' {
    interface FastifyReply {
        sendSuccess<T>(data?: T, statusCode?: number): FastifyReply;
        sendError(error: ApiError, statusCode?: number): FastifyReply;
    }
}

export function registerResponseDecorators(server: FastifyInstance) {
    server.decorateReply('sendSuccess', function(this: FastifyReply, data?: any, statusCode = 200) {
        const response: ApiResponse = {
            success: true,
            data
        };
        return this.status(statusCode).send(response);
    });

    server.decorateReply('sendError', function(this: FastifyReply, error: ApiError, statusCode = 500) {
        const response: ApiResponse = {
            success: false,
            error
        };
        return this.status(statusCode).send(response);
    });
}
