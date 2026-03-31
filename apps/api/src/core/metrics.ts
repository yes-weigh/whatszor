/**
 * core/metrics.ts — Minimal Redis counter store
 *
 * Provides lightweight daily counters stored in Redis.
 * No Prometheus, no extra dependencies — pure ioredis INCR.
 *
 * Key format: metric:<name>:<workspaceId>:<YYYY-MM-DD>
 * TTL: 32 days (gives monthly rollup window with some buffer)
 *
 * Usage:
 *   await metrics.incr('messages_sent', workspaceId);
 *   await metrics.get('bot_questions_asked', workspaceId);
 *   await metrics.getAll(['messages_sent', 'messages_failed'], workspaceId);
 */
import { getRedisClient } from './redis';

const TTL_SECONDS = 32 * 24 * 60 * 60; // 32 days

type MetricName =
    | 'messages_sent'
    | 'messages_failed'
    | 'campaigns_executed'
    | 'bot_questions_asked'
    | 'bot_responses_received'
    | 'bot_updates_applied';

function key(name: MetricName, workspaceId: string, date?: string): string {
    const d = date ?? new Date().toISOString().split('T')[0];
    return `metric:${name}:${workspaceId}:${d}`;
}

export const metrics = {
    async incr(name: MetricName, workspaceId: string): Promise<number> {
        const redis = getRedisClient();
        const k = key(name, workspaceId);
        const val = await redis.incr(k);
        // Only set TTL on first write (when val === 1)
        if (val === 1) await redis.expire(k, TTL_SECONDS);
        return val;
    },

    async incrBy(name: MetricName, workspaceId: string, by: number): Promise<number> {
        if (by <= 0) return 0;
        const redis = getRedisClient();
        const k = key(name, workspaceId);
        const val = await redis.incrby(k, by);
        if (val === by) await redis.expire(k, TTL_SECONDS);
        return val;
    },

    async get(name: MetricName, workspaceId: string, date?: string): Promise<number> {
        const redis = getRedisClient();
        const val = await redis.get(key(name, workspaceId, date));
        return val ? parseInt(val, 10) : 0;
    },

    /** Fetch multiple metrics for a workspace on the same date in one pipeline. */
    async getAll(names: MetricName[], workspaceId: string, date?: string): Promise<Record<string, number>> {
        const redis = getRedisClient();
        const pipeline = redis.pipeline();
        for (const name of names) pipeline.get(key(name, workspaceId, date));
        const results = await pipeline.exec();
        const out: Record<string, number> = {};
        names.forEach((name, i) => {
            const raw = results?.[i]?.[1] as string | null;
            out[name] = raw ? parseInt(raw, 10) : 0;
        });
        return out;
    },

    /** Get today's totals across all workspaces for a metric (for the system health panel). */
    async globalTotal(name: MetricName): Promise<number> {
        const redis = getRedisClient();
        const today = new Date().toISOString().split('T')[0];
        const pattern = `metric:${name}:*:${today}`;
        const keys = await redis.keys(pattern);
        if (keys.length === 0) return 0;
        const pipeline = redis.pipeline();
        for (const k of keys) pipeline.get(k);
        const results = await pipeline.exec();
        return (results ?? []).reduce((sum, r) => {
            const v = r?.[1] as string | null;
            return sum + (v ? parseInt(v, 10) : 0);
        }, 0);
    },
};
