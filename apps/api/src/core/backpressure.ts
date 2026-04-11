/**
 * core/backpressure.ts — Queue Pressure + Per-Session Rate Limiter
 *
 * Two-tier backpressure system for the 200-session scale target:
 *
 * Tier 1 — Queue depth gate:
 *   Call checkQueuePressure() before enqueuing outbound jobs.
 *   Returns whether the queue is healthy, and a recommendation.
 *
 * Tier 2 — Per-session token bucket:
 *   Call checkSessionRateLimit() before sending a message per session.
 *   Implements a sliding window rate limit in Redis.
 *   Default: 15 messages / 60 seconds per sessionId (WhatsApp TOS safe limit).
 *
 * Usage:
 *
 *   // Before enqueuing campaign messages:
 *   const { ok, recommendation } = await checkQueuePressure(QueueName.OUTBOUND_MESSAGES);
 *   if (!ok) { delay or reject }
 *
 *   // Before sending per session:
 *   const { allowed, retryAfterMs } = await checkSessionRateLimit(sessionId);
 *   if (!allowed) { schedule retry after retryAfterMs }
 */
import { getQueue, QueueName } from '../queues';
import { getRedisClient } from './redis';
import { createLogger } from './logger';
import { slidingWindowRateLimit, dequeueCounter } from './lua-scripts';
import crypto from 'node:crypto';

const log = createLogger({ module: 'backpressure' });

// ── Queue depth thresholds ────────────────────────────────────────────────────
// LOW:  system is healthy, accept all jobs
// HIGH: approaching capacity, start adding delay to campaign sends
// CRIT: saturated, pause new campaign sends until queue drains

const DEFAULT_HIGH_WATER_MARK = 500;   // jobs waiting — start throttling
const DEFAULT_CRIT_WATER_MARK = 2000;  // jobs waiting — pause producers

export type PressureLevel = 'LOW' | 'HIGH' | 'CRITICAL';

export interface QueuePressureResult {
    ok: boolean;
    level: PressureLevel;
    waitingCount: number;
    recommendation: 'proceed' | 'delay_ms' | 'pause';
    delayMs?: number;
}

/**
 * Check if a queue is under backpressure before enqueuing new jobs.
 *
 * @param queueName - The queue to check
 * @param highWaterMark - Override HIGH threshold (default 500)
 * @param critWaterMark - Override CRITICAL threshold (default 2000)
 */
export async function checkQueuePressure(
    queueName: QueueName,
    highWaterMark = DEFAULT_HIGH_WATER_MARK,
    critWaterMark = DEFAULT_CRIT_WATER_MARK,
): Promise<QueuePressureResult> {
    try {
        const queue = getQueue(queueName);
        const waitingCount = await queue.getWaitingCount();

        if (waitingCount >= critWaterMark) {
            log.warn({ queueName, waitingCount, level: 'CRITICAL' }, 'Queue backpressure CRITICAL — producers should pause');
            return {
                ok: false,
                level: 'CRITICAL',
                waitingCount,
                recommendation: 'pause',
            };
        }

        if (waitingCount >= highWaterMark) {
            // Proportional delay: 0ms at HIGH_WATER_MARK, 5000ms at CRIT_WATER_MARK
            const ratio = (waitingCount - highWaterMark) / (critWaterMark - highWaterMark);
            const delayMs = Math.min(Math.round(ratio * 5_000), 5_000);
            log.debug({ queueName, waitingCount, delayMs, level: 'HIGH' }, 'Queue backpressure HIGH — adding send delay');
            return {
                ok: true, // still ok to proceed, but with delay
                level: 'HIGH',
                waitingCount,
                recommendation: 'delay_ms',
                delayMs,
            };
        }

        return {
            ok: true,
            level: 'LOW',
            waitingCount,
            recommendation: 'proceed',
        };
    } catch (err) {
        // On Redis failure, allow enqueue (fail-open for liveness)
        log.warn({ err, queueName }, 'backpressure check failed — failing open');
        return { ok: true, level: 'LOW', waitingCount: 0, recommendation: 'proceed' };
    }
}

// ── Per-session token bucket rate limiter ─────────────────────────────────────
// Uses a Redis sliding window counter (INCR + EXPIRE).
// Each sessionId has a 60-second window with a max of 15 messages.
// This is intentionally conservative — WhatsApp's actual limit is higher,
// but staying below 15/min prevents soft bans on cheap hosting IPs.

const SESSION_RATE_LIMIT_MAX = 15;          // max messages per window
const SESSION_RATE_LIMIT_WINDOW_SEC = 60;   // sliding window in seconds
const SESSION_RATE_KEY_PREFIX = 'rl:sess:'; // Redis key prefix

export interface SessionRateLimitResult {
    allowed: boolean;
    current: number;
    max: number;
    retryAfterMs: number; // 0 if allowed
}

/**
 * Check if a session is within its per-minute rate limit.
 * Uses an atomic Lua sliding-window in Redis — cluster-safe, no TOCTOU.
 *
 * @param sessionId     - The Baileys session ID to rate-limit
 * @param maxPerWindow  - Max messages per WINDOW_SEC (default 15)
 */
export async function checkSessionRateLimit(
    sessionId: string,
    maxPerWindow = SESSION_RATE_LIMIT_MAX,
): Promise<SessionRateLimitResult> {
    const redis = getRedisClient();
    const key = `${SESSION_RATE_KEY_PREFIX}${sessionId}`;

    try {
        const result = await slidingWindowRateLimit(
            redis,
            key,
            Date.now(),
            SESSION_RATE_LIMIT_WINDOW_SEC * 1_000, // convert to ms
            maxPerWindow,
            crypto.randomUUID(), // unique per-request member ID
        );

        if (!result.allowed) {
            log.debug(
                { sessionId, current: result.currentCount, max: maxPerWindow, retryAfterMs: result.retryAfterMs },
                'Session rate limit exceeded (sliding window)'
            );
        }

        return {
            allowed:      result.allowed,
            current:      result.currentCount,
            max:          maxPerWindow,
            retryAfterMs: result.retryAfterMs,
        };
    } catch (err) {
        // On Redis failure, allow the send (fail-open)
        log.warn({ err, sessionId }, 'Session rate limit check failed — failing open');
        return { allowed: true, current: 0, max: maxPerWindow, retryAfterMs: 0 };
    }
}

/**
 * Reset the rate limit counter for a session.
 * Use when a session reconnects or during test teardown.
 */
export async function resetSessionRateLimit(sessionId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${SESSION_RATE_KEY_PREFIX}${sessionId}`);
}

/**
 * Get the current rate limit status without incrementing the counter.
 * Use for health checks and observability.
 */
export async function getSessionRateLimitStatus(sessionId: string): Promise<{
    current: number;
    max: number;
    ttl: number;
}> {
    const redis = getRedisClient();
    const key = `${SESSION_RATE_KEY_PREFIX}${sessionId}`;
    const [raw, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
    return {
        current: raw ? parseInt(raw, 10) : 0,
        max: SESSION_RATE_LIMIT_MAX,
        ttl: Math.max(ttl, 0),
    };
}

// ── Dequeue Rate Counter ───────────────────────────────────────────────────────
// Tracks how many jobs each queue is completing per 60-second window.
// The ratio of enqueue rate to dequeue rate determines the predictive
// backpressure signal in checkQueuePressure().
//
// Key: bp:deq:<queueName>  →  INCR on every successful job completion
// TTL: 60 seconds (rolling window — resets automatically)

const DEQUEUE_KEY_PREFIX = 'bp:deq:';
const DEQUEUE_WINDOW_SEC = 60;

/**
 * Record a successful job completion for backpressure ratio tracking.
 * Uses an atomic Lua INCR+PEXPIRE — fixes the crash-between-commands bug
 * in the previous two-command version.
 *
 * Fail-open: if Redis is unreachable, the metric is silently dropped.
 */
export async function recordDequeue(queueName: string): Promise<void> {
    const redis = getRedisClient();
    const key = `${DEQUEUE_KEY_PREFIX}${queueName}`;
    try {
        await dequeueCounter(redis, key, DEQUEUE_WINDOW_SEC * 1_000);
    } catch {
        // Fail silently — this is a metric, not a control path
    }
}

/**
 * Read the current dequeue rate for a queue (jobs completed in last 60s).
 * Use in the predictive backpressure check.
 */
export async function getDequeueRate(queueName: string): Promise<number> {
    const redis = getRedisClient();
    try {
        const raw = await redis.get(`${DEQUEUE_KEY_PREFIX}${queueName}`);
        return raw ? parseInt(raw, 10) : 0;
    } catch {
        return 0;
    }
}

