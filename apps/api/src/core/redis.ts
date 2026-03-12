import Redis from 'ioredis';
import { env } from '../env';
import { logger } from './logger';

const log = logger.child({ module: 'redis' });

let redisClient: Redis | null = null;

export function createRedisClient(): Redis {
    const client = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: true,
        lazyConnect: true,
    });

    client.on('connect', () => log.info('Redis connecting...'));
    client.on('ready', () => log.info('Redis connected and ready'));
    client.on('error', (err) => log.error({ err }, 'Redis error'));
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
        await redisClient.quit();
        redisClient = null;
        log.info('Redis disconnected');
    }
}
