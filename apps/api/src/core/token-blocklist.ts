/**
 * Token Blocklist
 *
 * When a workspace member is removed while they still hold a valid access token,
 * their userId+workspaceId pair is added to Redis with a TTL matching the
 * remaining JWT lifetime. The authenticate middleware checks this blocklist
 * on every request.
 *
 * Key format: `blocklist:member:{workspaceId}:{userId}`
 * TTL: remaining JWT lifetime (never more than JWT_EXPIRES_IN)
 */
import { getRedisClient } from './redis';
import { createLogger } from './logger';

const log = createLogger({ module: 'core:token-blocklist' });

const KEY_PREFIX = 'blocklist:member';

/**
 * Block a user's access to a specific workspace.
 * This effectively invalidates any in-flight access tokens they hold
 * for that workspace without needing to track individual token JTIs.
 *
 * @param workspaceId - The workspace the user was removed from
 * @param userId      - The workspace User.id (not GlobalUser.id) being blocked
 * @param ttlSeconds  - How long to hold the block; should be the remaining
 *                      access-token lifetime (e.g. JWT_EXPIRES_IN seconds)
 */
export async function blockMemberToken(
    workspaceId: string,
    userId: string,
    ttlSeconds: number,
): Promise<void> {
    const redis = getRedisClient();
    const key = `${KEY_PREFIX}:${workspaceId}:${userId}`;
    await redis.set(key, '1', 'EX', ttlSeconds);
    log.info({ workspaceId, userId, ttlSeconds }, 'Member token blocklisted');
}

/**
 * Returns true if the member has been blocklisted from a workspace.
 */
export async function isMemberBlocklisted(
    workspaceId: string,
    userId: string,
): Promise<boolean> {
    const redis = getRedisClient();
    const key = `${KEY_PREFIX}:${workspaceId}:${userId}`;
    const value = await redis.get(key);
    return value !== null;
}
