// ── Worker-level error classes (existing — keep for BullMQ) ──────────────────

export class RecoverableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RecoverableError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class FatalError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FatalError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class BatchProcessingError extends Error {
    public readonly errors: Error[];

    constructor(message: string, errors: Error[]) {
        super(message);
        this.name = 'BatchProcessingError';
        this.errors = errors;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

// ── Typed API Error ───────────────────────────────────────────────────────────
// Use AppError everywhere a route or service needs to abort with a known HTTP
// status + machine-readable code.  The global error-handler maps these to the
// standard { success: false, error: { code, message } } response envelope.

export type ErrorCode =
    | 'QUEUE_FAILED'
    | 'WA_DISCONNECTED'
    | 'SESSION_NOT_FOUND'
    | 'INVALID_INPUT'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'STORAGE_QUOTA_EXCEEDED'
    | 'RATE_LIMIT_EXCEEDED'
    | 'NO_ALLOWED_NUMBER'
    | 'WORKSPACE_SUSPENDED'
    | 'IMPERSONATION_EXPIRED'
    | 'INTERNAL_ERROR'
    | 'VALIDATION_ERROR';

const STATUS_MAP: Record<ErrorCode, number> = {
    QUEUE_FAILED: 503,
    WA_DISCONNECTED: 503,
    SESSION_NOT_FOUND: 404,
    INVALID_INPUT: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    STORAGE_QUOTA_EXCEEDED: 413,
    RATE_LIMIT_EXCEEDED: 429,
    NO_ALLOWED_NUMBER: 422,
    WORKSPACE_SUSPENDED: 403,
    IMPERSONATION_EXPIRED: 401,
    INTERNAL_ERROR: 500,
    VALIDATION_ERROR: 422,
};

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly statusCode: number;
    public readonly details?: unknown;

    constructor(code: ErrorCode, message: string, details?: unknown) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.statusCode = STATUS_MAP[code] ?? 500;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
