/**
 * Standard API response envelope used across all endpoints.
 */
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: ApiError;
    meta?: Record<string, unknown>;
}

export interface ApiError {
    code: string;
    message: string;
    details?: unknown;
}

export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    meta: PaginationMeta;
}

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}

/**
 * Standard error codes used across the platform.
 */
export const ErrorCodes = {
    // Auth
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

    // Validation
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    BAD_REQUEST: 'BAD_REQUEST',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',

    // Workspace
    WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
    WORKSPACE_SUSPENDED: 'WORKSPACE_SUSPENDED',

    // Server
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
