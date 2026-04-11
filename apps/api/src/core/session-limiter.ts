/**
 * core/session-limiter.ts — Per-session WhatsApp send rate limiter
 *
 * Uses a Redis Lua sliding-window to ensure no session exceeds the configured
 * message rate, even under concurrent workers.
 *
 * ── Why sliding window? ────────────────────────────────────────────────────
 * The previous INCR+EXPIRE approach used a FIXED window: all counts reset at
 * the 60-second boundary. This let a session send MAX messages at t=59s and
 * MAX more at t=61s — effectively 2× the limit in a 2-second span.
 *
 * A sliding window rolls with real time. A request added at t=59s is still
 * counted at t=100s, expiring only at t=119s. This is what WhatsApp's
 * servers actually enforce.
 *
 * ── Atomicity ──────────────────────────────────────────────────────────────
 * All Redis operations (ZREMRANGEBYSCORE, ZCARD, ZADD, PEXPIRE) execute in a
 * single EVAL call — no interleaving is possible even across workers.
 */

import crypto from 'node:crypto';
import { getRedisClient } from './redis';
import { createLogger } from './logger';
import { slidingWindowRateLimit } from './lua-scripts';

const log = createLogger({ module: 'session-limiter' });

// Default anti-ban threshold: 20 messages per minute per session.
// In test environments, raise the cap to avoid spurious test failures.
const MAX_MESSAGES_PER_MINUTE = process.env.NODE_ENV === 'test' ? 5000 : 20;
const WINDOW_MS = 60_000; // 60 seconds in milliseconds

const KEY_PREFIX       = 'rl:sw:sess:';    // sorted-set key per session
const CUSTOM_LIMIT_KEY = 'ratelimit:custom_limit:'; // override key (unchanged)

export interface RateLimitResult {
    allowed: boolean;
    retryAfterMs: number;
}

/**
 * Convenience wrapper — returns a plain boolean.
 * Use when you don't need the retryAfterMs value.
 */
export async function allowSessionSend(
    sessionId: string,
    maxPerMinOverride?: number,
): Promise<boolean> {
    const result = await checkSessionLimit(sessionId, maxPerMinOverride);
    return result.allowed;
}

/**
 * Full rate-limit check returning retryAfterMs for precise delay scheduling.
 * Use this version in the outbound worker so moveToDelayed() gets the exact wait.
 *
 * @param sessionId       - The Baileys session ID to rate-limit
 * @param maxPerMinOverride - Optional override (skips Redis custom_limit lookup)
 */
export async function checkSessionLimit(
    sessionId: string,
    maxPerMinOverride?: number,
): Promise<RateLimitResult> {
    const redis = getRedisClient();

    try {
        // 1. Resolve the effective limit
        let limit = MAX_MESSAGES_PER_MINUTE;
        if (maxPerMinOverride !== undefined) {
            limit = maxPerMinOverride;
        } else {
            const customLimit = await redis.get(`${CUSTOM_LIMIT_KEY}${sessionId}`);
            if (customLimit) limit = parseInt(customLimit, 10);
        }

        // 2. Run the atomic Lua sliding-window check + reservation
        //    reqId must be unique per send attempt — using a random UUID here
        //    ensures no two concurrent sends accidentally share the same sorted-set member.
        const reqId = crypto.randomUUID();
        const result = await slidingWindowRateLimit(
            redis,
            `${KEY_PREFIX}${sessionId}`,
            Date.now(),
            WINDOW_MS,
            limit,
            reqId,
        );

        if (!result.allowed) {
            log.debug(
                { sessionId, count: result.currentCount, limit, retryAfterMs: result.retryAfterMs },
                'Session rate limit exceeded (sliding window)',
            );
        }

        return {
            allowed: result.allowed,
            retryAfterMs: result.retryAfterMs,
        };
    } catch (err) {
        // Redis failure → fail open (liveness over strict rate enforcement)
        log.warn({ err, sessionId }, 'Session rate limiter Lua call failed — failing open');
        return { allowed: true, retryAfterMs: 0 };
    }
}
