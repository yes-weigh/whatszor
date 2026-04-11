import { prisma } from '../../prisma/client';
import { getRedisClient } from '../../core/redis';

const CACHE_TTL_SECONDS = 600; // 10 minutes (per spec 5-10 mins)

/**
 * Returns an array of sessionIds that the user has explicit access to within the workspace.
 * Caches the result in Redis with a TTL to maintain high performance across frequent API requests.
 */
export async function getAllowedSessions(workspaceId: string, userId: string): Promise<string[]> {
    const redis = getRedisClient();
    const cacheKey = `access:sess:usr_${workspaceId}_${userId}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (err) {
        // Fallback silently if Redis throws an anomaly so service remains online hitting DB
    }

    // DB Fallback / Cache Miss
    const accessRecords = await prisma.accountAccess.findMany({
        where: { workspaceId, userId },
        select: { sessionId: true },
    });

    const sessionIds = accessRecords.map((a: { sessionId: string }) => a.sessionId);

    try {
        await redis.set(cacheKey, JSON.stringify(sessionIds), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
        // Ignore cache set failures to prevent disruption
    }

    return sessionIds;
}

/**
 * Grants access to a session for a user.
 * Rapidly discards any existing cache to force a fresh DB lookup on the user's next API hit.
 */
export async function grantSessionAccess(workspaceId: string, sessionId: string, userId: string) {
    const result = await prisma.accountAccess.upsert({
        where: {
            sessionId_userId: { sessionId, userId }
        },
        update: {},
        create: {
            workspaceId,
            sessionId,
            userId,
        }
    });

    const redis = getRedisClient();
    await redis.del(`access:sess:usr_${workspaceId}_${userId}`).catch(() => {});

    return result;
}

/**
 * Revokes session access for a user, completely dropping their cache mapping.
 */
export async function revokeSessionAccess(workspaceId: string, sessionId: string, userId: string) {
    const result = await prisma.accountAccess.deleteMany({
        where: { workspaceId, sessionId, userId }
    });

    const redis = getRedisClient();
    await redis.del(`access:sess:usr_${workspaceId}_${userId}`).catch(() => {});

    return result;
}
