/**
 * Shared error creation utility for consistent error objects
 * containing application codes and HTTP status hints.
 */
export function createError(message: string, code: string, statusCode: number = 500) {
    const err = new Error(message) as Error & { code: string; statusCode: number };
    err.code = code;
    err.statusCode = statusCode;
    return err;
}

export interface AppError extends Error {
    code: string;
    statusCode: number;
}

export class DomainError extends Error implements AppError {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class SessionOwnershipError extends DomainError {
    constructor(message: string = 'Access denied: You do not own this session') {
        super(message, 'SESSION_OWNERSHIP_ERROR', 403);
    }
}

export class SessionNotFoundError extends DomainError {
    constructor(message: string = 'Session not found or inactive') {
        super(message, 'SESSION_NOT_FOUND', 404);
    }
}

export class RateLimitExceededError extends DomainError {
    constructor(message: string = 'Rate limit exceeded for this operation') {
        super(message, 'RATE_LIMIT_EXCEEDED', 429);
    }
}

export class InvalidStateTransitionError extends DomainError {
    constructor(message: string = 'Invalid state transition attempted') {
        super(message, 'INVALID_STATE_TRANSITION', 400);
    }
}
