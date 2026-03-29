import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env before it gets validated by other imports
vi.mock('../env', () => ({
    env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        REDIS_URL: 'redis://localhost:6379',
    },
}));

import { acquireIdempotencyLock, completeIdempotency, releaseIdempotencyLock } from './idempotency';
import { getRedisClient } from './redis';

// Mock Redis client
vi.mock('./redis', () => ({
    getRedisClient: vi.fn(),
}));

describe('Idempotency Utility', () => {
    const mockRedis = {
        set: vi.fn(),
        get: vi.fn(),
        del: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (getRedisClient as any).mockReturnValue(mockRedis);
    });

    it('should acquire lock if key does not exist', async () => {
        mockRedis.set.mockResolvedValue('OK');
        
        const result = await acquireIdempotencyLock('test-key');
        
        expect(result).toBeNull();
        expect(mockRedis.set).toHaveBeenCalledWith('test-key', 'PROCESSING', 'EX', 86400, 'NX');
    });

    it('should return existing state if key already exists', async () => {
        mockRedis.set.mockResolvedValue(null); // NX failed
        mockRedis.get.mockResolvedValue('COMPLETED');
        
        const result = await acquireIdempotencyLock('test-key');
        
        expect(result).toBe('COMPLETED');
        expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should default to PROCESSING if get returns null after NX fail (race condition)', async () => {
        mockRedis.set.mockResolvedValue(null);
        mockRedis.get.mockResolvedValue(null);
        
        const result = await acquireIdempotencyLock('test-key');
        
        expect(result).toBe('PROCESSING');
    });

    it('should mark idempotency as completed', async () => {
        await completeIdempotency('test-key');
        expect(mockRedis.set).toHaveBeenCalledWith('test-key', 'COMPLETED', 'EX', 86400);
    });

    it('should release lock by deleting key', async () => {
        await releaseIdempotencyLock('test-key');
        expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });
});
