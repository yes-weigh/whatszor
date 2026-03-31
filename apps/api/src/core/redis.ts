import Redis from 'ioredis';
import { env } from '../env';
import { createLogger } from './logger';
import { alertRedisDisconnect } from './alert';

const log = createLogger({ module: 'redis', action: 'connection' });

let redisClient: Redis | null = null;

export function createRedisClient(): Redis {
    const client = new Redis(env.REDIS_URL, {
        ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
        maxRetriesPerRequest: null,   // Required for BullMQ
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 10000,      // 10s timeout to survive network partition
        enableOfflineQueue: true,   // Buffer requests if Redis is briefly down
        // Retry with exponential backoff up to 30s — survives transient ECONNRESET.
        retryStrategy: (times: number) => {
            const delay = Math.min(times * 200, 30_000);
            log.warn({ attempt: times, delayMs: delay }, 'Redis reconnecting after error');
            return delay;
        },
        reconnectOnError: (err: Error) => {
            // Reconnect on ECONNRESET, ETIMEDOUT, ENOTFOUND
            const reconnectCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
            if (reconnectCodes.some(code => err.message.includes(code) || (err as any).code === code)) {
                log.warn({ err: err.message }, 'Redis reconnecting after error code');
                return true;
            }
            return false;
        },
    });

    client.on('connect', () => log.info('Redis connecting...'));
    client.on('ready', () => log.info('Redis connected and ready'));
    client.on('error', (err) => {
        log.error({ err }, 'Redis error');
        if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
            alertRedisDisconnect(err).catch(() => {});
        }
    });
    client.on('close', () => log.warn('Redis connection closed'));
    client.on('reconnecting', () => log.warn('Redis reconnecting...'));

    return client;
}

/**
 * Returns the singleton Redis client (creates it if not yet initialized).
 * Call connect() separately after server starts.
 */
export function getRedisClient(): Redis {
    if (!redisClient) {
        redisClient = createRedisClient();
    }
    return redisClient;
}

export async function connectRedis(): Promise<void> {
    const client = getRedisClient();
    try {
        if (client.status === 'wait') {
            await client.connect();
        }
    } catch (err: any) {
        if (err.message !== 'Redis is already connecting/connected') {
            throw err;
        }
    }
}

export async function disconnectRedis(): Promise<void> {
    if (redisClient) {
        try {
            // Attempt to quit gracefully (wait for pending commands)
            const quitPromise = redisClient.quit();
            // Fallback: force disconnect if quit() takes more than 5 seconds
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis quit timeout')), 5000)
            );

            await Promise.race([quitPromise, timeoutPromise]);
            log.info('Redis disconnected gracefully');
        } catch (err) {
            log.warn({ err }, 'Redis forced disconnect after timeout');
            await redisClient.disconnect();
        } finally {
            redisClient = null;
        }
    }
}
