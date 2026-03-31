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

    server.decorateReply('sendError', function(this: FastifyReply, error: ApiError, statusCode?: number) {
        const response: ApiResponse = {
            success: false,
            error
        };
        // Use provided status or the reply's current status if it's already an error, else 500
        const finalStatus = statusCode || (this.statusCode >= 400 ? this.statusCode : 500);
        return this.status(finalStatus).send(response);
    });
}
