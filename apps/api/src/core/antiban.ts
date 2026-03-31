/**
 * Anti-Ban Manager — per-session AntiBan configuration and warm-up state persistence.
 *
 * Each WhatsApp session gets its own configuration and independently persisted warm-up
 * state in Redis. The actual AntiBan instance lives inside the WrappedSocket created
 * by wrapSocket() in whatsapp.service.ts.
 */
import type { AntiBanConfig } from 'baileys-antiban';
import type { WarmUpState } from 'baileys-antiban';
import { createLogger } from './logger';
import { getRedisClient } from './redis';

const log = createLogger({ module: 'antiban' });

// Wrapped sockets are stored here so we can call .antiban methods and getStats()
type MinimalWrappedSocket = {
    antiban: {
        getStats: () => object;
        onDisconnect: (code?: any) => void;
        onReconnect: () => void;
        exportWarmUpState: () => WarmUpState;
    };
};

const wrappedSockets = new Map<string, MinimalWrappedSocket>();

const REDIS_KEY_PREFIX = 'antiban:warmup:';
const REDIS_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const ANTIBAN_CONFIG: AntiBanConfig = {
    rateLimiter: {
        maxPerMinute: 60,
        maxPerHour: 1000,
        maxPerDay: 5000,
        minDelayMs: 1500,
        maxDelayMs: 5000,
        newChatDelayMs: 3000,
        maxIdenticalMessages: 100,
        burstAllowance: 20,
    },
    warmUp: {
        warmUpDays: 7,
        day1Limit: 20,
        growthFactor: 1.8,
        inactivityThresholdHours: 72,
    },
    health: {
        disconnectWarningThreshold: 3,
        disconnectCriticalThreshold: 5,
        failedMessageThreshold: 5,
        autoPauseAt: 'high',
        onRiskChange: (status: any) => {
            log.warn(
                { risk: status.risk, score: status.score, recommendation: status.recommendation },
                'AntiBan risk level changed'
            );
        },
    },
    logging: false,
};

/**
 * Load the warm-up state for a session from Redis.
 * Returns undefined if no state has been saved yet.
 */
export async function loadWarmUpState(sessionId: string): Promise<WarmUpState | undefined> {
    try {
        const redis = getRedisClient();
        const raw = await redis.get(`${REDIS_KEY_PREFIX}${sessionId}`);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as WarmUpState;
        log.info({ sessionId }, 'Loaded AntiBan warm-up state from Redis');
        return parsed;
    } catch (err) {
        log.warn({ err, sessionId }, 'Failed to load AntiBan warm-up state from Redis — starting fresh');
        return undefined;
    }
}

/**
 * Register a newly wrapped socket so antiban stats and lifecycle methods
 * can be accessed globally (e.g. from health endpoint, disconnect handler).
 */
export function registerWrappedSocket(sessionId: string, wrappedSock: MinimalWrappedSocket): void {
    wrappedSockets.set(sessionId, wrappedSock);
    log.info({ sessionId }, 'AntiBan wrapped socket registered');
}

/**
 * Persist the current warm-up state for a session to Redis.
 * Call this on disconnect so progress survives API restarts.
 */
export async function persistWarmUpState(sessionId: string): Promise<void> {
    const sock = wrappedSockets.get(sessionId);
    if (!sock) return;
    try {
        const redis = getRedisClient();
        const state = sock.antiban.exportWarmUpState();
        await redis.set(
            `${REDIS_KEY_PREFIX}${sessionId}`,
            JSON.stringify(state),
            'EX',
            REDIS_TTL_SECONDS
        );
        log.debug({ sessionId }, 'Persisted AntiBan warm-up state to Redis');
    } catch (err) {
        log.warn({ err, sessionId }, 'Failed to persist AntiBan warm-up state');
    }
}

/**
 * Unregister and clean up a session's wrapped socket.
 * Call this when a session is permanently deleted.
 */
export function removeAntiBan(sessionId: string): void {
    wrappedSockets.delete(sessionId);
    try {
        getRedisClient().del(`${REDIS_KEY_PREFIX}${sessionId}`);
    } catch { /* ignore */ }
    log.info({ sessionId }, 'AntiBan instance removed');
}

/**
 * Returns the live stats for a session's AntiBan instance.
 * Returns null if the session is not connected / wrapped.
 */
export function getAntibanStats(sessionId: string): object | null {
    const sock = wrappedSockets.get(sessionId);
    return sock ? sock.antiban.getStats() : null;
}
