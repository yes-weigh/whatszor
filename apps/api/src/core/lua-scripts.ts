/**
 * core/lua-scripts.ts — Redis Lua script loader with EVALSHA caching
 *
 * Workflow:
 *   1. On first use, load the script into Redis via SCRIPT LOAD → get SHA.
 *   2. On every subsequent call, use EVALSHA (zero network overhead for script body).
 *   3. If Redis returns NOSCRIPT (script was flushed), fall back to EVAL and
 *      re-cache the SHA automatically.
 *
 * Why Lua instead of individual Redis commands?
 *   - Atomicity: all operations in a script run inside a Redis transaction.
 *     No other command can interleave — eliminates TOCTOU races.
 *   - Round-trip reduction: one network call instead of 2-4 sequential calls.
 *   - Cluster-safe: as long as all KEYS[] hash to the same slot (which they
 *     do here — each call uses exactly one key), Lua is fully cluster-compatible.
 *
 * Usage:
 *   const result = await luaScripts.slidingWindowRateLimit(redis, key, nowMs, windowMs, max, reqId);
 *   const count  = await luaScripts.dequeueCounter(redis, key, ttlMs);
 */

import type { Redis } from 'ioredis';
import { createLogger } from './logger';

const log = createLogger({ module: 'lua-scripts' });

// ── SHA cache ─────────────────────────────────────────────────────────────────
// Keyed by script filename. Populated lazily on first evalScript() call.

const shaCache = new Map<string, string>();

/**
 * Load a Lua script into Redis and cache its SHA.
 * Idempotent — SCRIPT LOAD returns the same SHA for the same script content.
 */
async function loadSha(redis: Redis, filename: string, source: string): Promise<string> {
    const existing = shaCache.get(filename);
    if (existing) return existing;

    // ioredis types script() to only accept 'exists', but SCRIPT LOAD is a
    // valid Redis command. Use the low-level .call() with an explicit cast.
    const sha = await (redis as any).call('SCRIPT', 'LOAD', source) as string;
    shaCache.set(filename, sha);
    log.debug({ filename, sha }, 'Lua script loaded into Redis');
    return sha;
}

/**
 * Execute a Lua script atomically, using EVALSHA with automatic fallback to
 * EVAL if the script has been flushed from Redis's script cache.
 */
async function evalScript(
    redis: Redis,
    filename: string,
    source: string,
    numKeys: number,
    args: (string | number)[],
): Promise<unknown> {
    const sha = await loadSha(redis, filename, source);
    const strArgs = args.map(String);

    try {
        return await redis.evalsha(sha, numKeys, ...strArgs);
    } catch (err: any) {
        if (err?.message?.includes('NOSCRIPT')) {
            // Script was evicted (SCRIPT FLUSH or Redis restart) — reload and retry
            log.warn({ filename }, 'NOSCRIPT error — reloading Lua script');
            shaCache.delete(filename);
            const freshSha = await loadSha(redis, filename, source);
            return redis.evalsha(freshSha, numKeys, ...strArgs);
        }
        throw err;
    }
}

// ── Script definitions ────────────────────────────────────────────────────────

const SLIDING_WINDOW_FILE    = 'sliding_window_ratelimit.lua';
const DEQUEUE_COUNTER_FILE   = 'dequeue_counter.lua';

const _slidingWindowSrc = `
local key        = KEYS[1]
local now_ms     = tonumber(ARGV[1])
local window_ms  = tonumber(ARGV[2])
local max_req    = tonumber(ARGV[3])
local req_id     = ARGV[4]

local window_start = now_ms - window_ms

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

local count = tonumber(redis.call('ZCARD', key))

if count >= max_req then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after_ms = 0
    if #oldest >= 2 then
        local oldest_ts = tonumber(oldest[2])
        retry_after_ms = math.max(0, (oldest_ts + window_ms) - now_ms + 1)
    else
        retry_after_ms = window_ms
    end
    return { 0, count, retry_after_ms }
end

redis.call('ZADD', key, now_ms, req_id)
redis.call('PEXPIRE', key, window_ms + 5000)

return { 1, count + 1, 0 }
`;

const _dequeueCounterSrc = `
local key    = KEYS[1]
local ttl_ms = tonumber(ARGV[1])

local count = redis.call('INCR', key)

if count == 1 then
    redis.call('PEXPIRE', key, ttl_ms)
end

return count
`;

function getSlidingWindowSrc(): string {
    return _slidingWindowSrc;
}

function getDequeueCounterSrc(): string {
    return _dequeueCounterSrc;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SlidingWindowResult {
    allowed: boolean;
    currentCount: number;
    retryAfterMs: number;
}

/**
 * Atomic sliding-window rate limit check + reservation.
 *
 * @param redis     - ioredis client instance
 * @param key       - Redis key for the sorted set (must be unique per rate-limit subject)
 * @param nowMs     - Current Unix timestamp in milliseconds (pass Date.now())
 * @param windowMs  - Window size in milliseconds (e.g. 60_000 for 60 seconds)
 * @param maxReq    - Maximum requests allowed in the window
 * @param reqId     - Unique ID for this request (jobId, traceId, UUID) — prevents dedup issues
 *
 * @returns { allowed, currentCount, retryAfterMs }
 *   - allowed: true if the request is within the limit
 *   - currentCount: number of requests in the window after this call
 *   - retryAfterMs: ms until the next request will be allowed (0 if allowed)
 */
export async function slidingWindowRateLimit(
    redis: Redis,
    key: string,
    nowMs: number,
    windowMs: number,
    maxReq: number,
    reqId: string,
): Promise<SlidingWindowResult> {
    const raw = await evalScript(
        redis,
        SLIDING_WINDOW_FILE,
        getSlidingWindowSrc(),
        1, // numKeys
        [key, nowMs, windowMs, maxReq, reqId],
    ) as [number, number, number];

    return {
        allowed:      raw[0] === 1,
        currentCount: raw[1],
        retryAfterMs: raw[2],
    };
}

/**
 * Atomic INCR + PEXPIRE for the backpressure dequeue counter.
 * Fixes the crash-between-commands bug in the two-command version.
 *
 * @param redis  - ioredis client instance
 * @param key    - Counter key (e.g. "bp:deq:outbound-messages")
 * @param ttlMs  - TTL for the counter key in milliseconds
 *
 * @returns Current count after increment
 */
export async function dequeueCounter(
    redis: Redis,
    key: string,
    ttlMs: number,
): Promise<number> {
    const raw = await evalScript(
        redis,
        DEQUEUE_COUNTER_FILE,
        getDequeueCounterSrc(),
        1, // numKeys
        [key, ttlMs],
    );
    return Number(raw);
}

/**
 * Pre-warm all Lua scripts into Redis at startup.
 * Optional but recommended — avoids the SCRIPT LOAD latency on the first
 * real request. Call this after Redis connects.
 */
export async function preloadLuaScripts(redis: Redis): Promise<void> {
    try {
        await Promise.all([
            loadSha(redis, SLIDING_WINDOW_FILE, getSlidingWindowSrc()),
            loadSha(redis, DEQUEUE_COUNTER_FILE, getDequeueCounterSrc()),
        ]);
        log.info('Lua scripts pre-loaded into Redis');
    } catch (err) {
        // Non-fatal — scripts will be loaded lazily on first use
        log.warn({ err }, 'Lua script pre-load failed — will load on first use');
    }
}
