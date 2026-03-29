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
