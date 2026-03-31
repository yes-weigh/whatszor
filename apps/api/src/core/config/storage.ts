import type { PlanTier } from '@prisma/client';

/**
 * Default per-plan storage limits in bytes.
 * These are the caps applied when `Workspace.storageLimitBytes === 0n`
 * (i.e., no per-workspace override is set).
 *
 * Override at runtime by setting `Workspace.storageLimitBytes > 0` via the admin panel.
 */
export const PlanStorageLimits: Record<PlanTier, bigint> = {
    FREE:    BigInt(100 * 1024 * 1024),    //  100 MB
    STARTER: BigInt(500 * 1024 * 1024),    //  500 MB
    PRO:     BigInt(2 * 1024 * 1024 * 1024), //  2 GB
    AGENCY:  BigInt(10 * 1024 * 1024 * 1024), // 10 GB
};

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
    return storageLimitBytes > 0n ? storageLimitBytes : (PlanStorageLimits[planTier] ?? PlanStorageLimits.FREE);
}
