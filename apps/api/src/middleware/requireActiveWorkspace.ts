import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../prisma/client';

// ── Thundering-Herd-Safe Workspace Cache ────────────────────────────────────
//
// PROBLEM: When 50 profile-picture requests arrive simultaneously on the first
// page load, all 50 see an empty cache at the same moment and all fire a DB
// query concurrently — exhausting the Prisma connection pool.
//
// FIX: Store a shared in-flight promise. All concurrent requests for the same
// workspace await the single in-flight DB query instead of spawning their own.
// Once settled, results are cached for CACHE_TTL_MS so subsequent requests
// need no DB round-trip at all.
// ────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;

interface WorkspaceEntry {
    status: string;
    expiresAt: Date | null;
    cachedAt: number;
}

// Resolved value cache (post-fetch)
const workspaceCache = new Map<string, WorkspaceEntry>();

// In-flight request deduplication (thundering herd protection)
const inflight = new Map<string, Promise<WorkspaceEntry | null>>();

async function fetchWorkspace(workspaceId: string): Promise<WorkspaceEntry | null> {
    // If there is already a request in-flight for this workspaceId,
    // share that promise instead of opening a new DB connection.
    let pending = inflight.get(workspaceId);
    if (pending) return pending;

    const promise = prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { status: true, expiresAt: true }
    }).then(dbWorkspace => {
        if (!dbWorkspace) return null;
        const entry: WorkspaceEntry = {
            status: dbWorkspace.status,
            expiresAt: dbWorkspace.expiresAt,
            cachedAt: Date.now(),
        };
        workspaceCache.set(workspaceId, entry);
        return entry;
    }).finally(() => {
        inflight.delete(workspaceId);
    });

    inflight.set(workspaceId, promise);
    return promise;
}

export async function requireActiveWorkspace(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    if (!request.user || !request.user.workspaceId) {
        return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' }
        });
    }

    // Admins bypass workspace checks
    if (request.user.workspaceId === 'ADMIN_WORKSPACE') {
        return;
    }

    const now = Date.now();
    let workspace = workspaceCache.get(request.user.workspaceId);

    // Use cached value if still fresh
    if (!workspace || (now - workspace.cachedAt > CACHE_TTL_MS)) {
        const result = await fetchWorkspace(request.user.workspaceId);
        if (!result) {
            return reply.status(404).send({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Workspace not found' }
            });
        }
        workspace = result;
    }

    if (workspace.status === 'SUSPENDED' || workspace.status === 'EXPIRED') {
        return reply.status(402).send({
            success: false,
            error: { code: 'PAYMENT_REQUIRED', message: `Workspace is ${workspace.status.toLowerCase()}. Please activate a license key.` }
        });
    }

    if (workspace.status === 'TRIAL') {
        // Block only if an expiry date IS set AND it has already passed
        if (workspace.expiresAt && workspace.expiresAt < new Date()) {
            return reply.status(402).send({
                success: false,
                error: { code: 'PAYMENT_REQUIRED', message: 'Workspace trial has expired. Please activate a license key.' }
            });
        }
    }
}

/**
 * Purge a workspace's cached status entry.
 * Call this after any admin action that changes workspace.status
 * so the access-control middleware picks up the new value immediately.
 */
export function invalidateWorkspaceCache(workspaceId: string): void {
    workspaceCache.delete(workspaceId);
    inflight.delete(workspaceId);
}
