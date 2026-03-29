import { getRedisClient } from './redis';
import { createLogger } from './logger';

const log = createLogger({ module: 'core:idempotency' });

export type IdempotencyState = 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Atomic idempotency check and lock using Redis SET key value NX EX.
 * 
 * Flow:
 * 1. SET key 'PROCESSING' NX EX ttl -> returns OK if first time
 * 2. If already exists, return current state
 * 
 * @param key Unique key (e.g., wa:in:msg-123)
 * @param ttlSeconds How long the lock remains (default 24h)
 */
export async function acquireIdempotencyLock(key: string, ttlSeconds = 86400): Promise<IdempotencyState | null> {
    const redis = getRedisClient();
    
    // Attempt to set 'PROCESSING' only if it doesn't exist
    const result = await redis.set(key, 'PROCESSING', 'EX', ttlSeconds, 'NX');
    
    if (result === 'OK') {
        log.debug({ key }, 'Idempotency lock acquired (PROCESSING)');
        return null; // Null means we got the lock
    }

    // Already exists — fetch current state
    const state = await redis.get(key);
    log.info({ key, state }, 'Idempotency key found — returning existing state');
    return (state as IdempotencyState) || 'PROCESSING';
}

/**
 * Updates the idempotency state to COMPLETED once processing is successful.
 */
export async function completeIdempotency(key: string, ttlSeconds = 86400): Promise<void> {
    const redis = getRedisClient();
    await redis.set(key, 'COMPLETED', 'EX', ttlSeconds);
    log.debug({ key }, 'Idempotency marked COMPLETED');
}

/**
 * Deletes the idempotency lock to allow retry if the process failed.
 */
export async function releaseIdempotencyLock(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(key);
    log.debug({ key }, 'Idempotency lock released (deleted) for retry');
}
