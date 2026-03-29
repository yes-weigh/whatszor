import { describe, it, expect } from 'vitest'
import { createError } from './src/utils/errors'
import { ErrorCodes } from './src/types/api'

describe('createError', () => {
    it('should create an error with the specified message and code', () => {
        const error = createError('Test error', ErrorCodes.BAD_REQUEST, 400);
        expect(error.message).toBe('Test error');
        expect(error.code).toBe(ErrorCodes.BAD_REQUEST);
        expect(error.statusCode).toBe(400);
    });

    it('should default to Internal Server Error status code if not provided', () => {
        const error = createError('Default error', ErrorCodes.INTERNAL_ERROR);
        expect(error.statusCode).toBe(500);
    });
});
