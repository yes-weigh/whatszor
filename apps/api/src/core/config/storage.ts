import type { PlanTier } from '@prisma/client';
import { PLAN_LIMITS } from './pricing';

/**
 * Resolve the *effective* storage limit for a workspace.
 *
 * Logic:
 *  - If `storageLimitBytes > 0`: use the workspace-specific override.
 *  - Otherwise: fall back to the plan tier default.
 *
 * @param planTier          The workspace's active plan tier.
 * @param storageLimitBytes The workspace-specific override (from DB). 0n = use plan default.
 * @returns The effective limit in bytes as a BigInt.
 */
export function resolveStorageLimit(planTier: PlanTier, storageLimitBytes: bigint): bigint {
    return storageLimitBytes > 0n ? storageLimitBytes : (PLAN_LIMITS[planTier]?.storageLimitBytes ?? PLAN_LIMITS.FREE.storageLimitBytes);
}

