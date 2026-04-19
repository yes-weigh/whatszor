import { prisma } from '../../prisma/client';
import bcrypt from 'bcryptjs';
import type { UpdateWorkspaceInput, InviteMemberInput } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';
import { logEvent } from '../../core/event-logger';
import { blockMemberToken } from '../../core/token-blocklist';
import { env } from '../../env';


// ── Workspace ──────────────────────────────────────────────

export async function getWorkspace(workspaceId: string) {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            plan: true,
            planTier: true,
            broadcastUsageMonth: true,
            broadcastUsageCurrentMonth: true,
            storageUsedBytes: true,
            storageLimitBytes: true,
            settings: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!workspace) {
        const err = new Error('Workspace not found') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.WORKSPACE_NOT_FOUND;
        err.statusCode = 404;
        throw err;
    }

    return {
        ...workspace,
        storageUsedBytes: Number(workspace.storageUsedBytes),
        storageLimitBytes: Number(workspace.storageLimitBytes),
    };
}

export async function updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput) {
    const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
            name: input.name ?? undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            settings: input.settings as any,
        },
        select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            plan: true,
            planTier: true,
            broadcastUsageMonth: true,
            broadcastUsageCurrentMonth: true,
            storageUsedBytes: true,
            storageLimitBytes: true,
            settings: true,
            updatedAt: true,
        },
    });

    return {
        ...updated,
        storageUsedBytes: Number(updated.storageUsedBytes),
        storageLimitBytes: Number(updated.storageLimitBytes),
    };
}

// ── Members ────────────────────────────────────────────────

export async function listMembers(workspaceId: string) {
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: {
            user: {
                select: { id: true, name: true, email: true, avatarUrl: true, lastLoginAt: true },
            },
        },
        orderBy: { joinedAt: 'asc' },
    });

    return members.map((m) => ({
        id: m.id,
        userId: m.userId,  // the actual user ID needed for session assignment
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
    }));
}

export async function inviteMember(workspaceId: string, input: InviteMemberInput) {
    const { email, role, password } = input;

    // Find user by email
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        // Create user with the provided password since they don't exist
        const passwordHash = await bcrypt.hash(password, 12);
        user = await prisma.user.create({
            data: {
                name: email.split('@')[0],
                email,
                passwordHash,
            }
        });
    }

    // Check if already a member
    const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
    });
    if (existing) {
        const err = new Error('User is already a member of this workspace') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.CONFLICT;
        err.statusCode = 409;
        throw err;
    }

    const member = await prisma.workspaceMember.create({
        data: { workspaceId, userId: user.id, role },
        include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
    });

    return { id: member.id, role: member.role, joinedAt: member.joinedAt, user: member.user };
}

export async function updateMemberRole(
    workspaceId: string,
    memberId: string,
    newRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
    requestorRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
) {
    // ADMIN cannot promote anyone to OWNER — only OWNER can do that
    if (requestorRole === 'ADMIN' && newRole === 'OWNER') {
        const err = new Error('ADMINs cannot promote members to OWNER role') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.FORBIDDEN;
        err.statusCode = 403;
        throw err;
    }

    const member = await prisma.workspaceMember.findFirst({
        where: { id: memberId, workspaceId },
    });

    if (!member) {
        const err = new Error('Member not found') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.NOT_FOUND;
        err.statusCode = 404;
        throw err;
    }

    if (member.role === 'OWNER' && newRole !== 'OWNER') {
        const ownerCount = await prisma.workspaceMember.count({
            where: { workspaceId, role: 'OWNER' }
        });
        if (ownerCount <= 1) {
            const err = new Error('Cannot demote the last workspace owner') as Error & { code: string; statusCode: number };
            err.code = ErrorCodes.FORBIDDEN;
            err.statusCode = 403;
            throw err;
        }
    }

    const oldRole = member.role;
    const updated = await prisma.workspaceMember.update({
        where: { id: memberId },
        data: { role: newRole },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }
    });

    // Audit: log role changes for compliance
    logEvent(workspaceId, 'member_role_changed', 'workspace_admin', {
        memberId,
        oldRole,
        newRole,
    }); // Non-blocking — audit failure must not block the operation
    
    return { id: updated.id, role: updated.role, joinedAt: updated.joinedAt, user: updated.user };
}

export async function removeMember(workspaceId: string, memberId: string, requestingUserId: string) {
    const member = await prisma.workspaceMember.findFirst({
        where: { id: memberId, workspaceId },
    });

    if (!member) {
        const err = new Error('Member not found') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.NOT_FOUND;
        err.statusCode = 404;
        throw err;
    }

    if (member.userId === requestingUserId) {
        const err = new Error('Cannot remove yourself') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.FORBIDDEN;
        err.statusCode = 403;
        throw err;
    }

    if (member.role === 'OWNER') {
        const ownerCount = await prisma.workspaceMember.count({
            where: { workspaceId, role: 'OWNER' }
        });
        if (ownerCount <= 1) {
            const err = new Error('Cannot remove the last workspace owner') as Error & { code: string; statusCode: number };
            err.code = ErrorCodes.FORBIDDEN;
            err.statusCode = 403;
            throw err;
        }
    }

    await prisma.workspaceMember.delete({ where: { id: memberId } });

    // ── Blocklist their in-flight token for this workspace ─────────────────────
    // Parse JWT_EXPIRES_IN string (e.g. '15m', '1h', '1d') to a seconds value.
    // The access token lifetime sets the upper bound for the blocklist TTL.
    const jwtExpiresStr = env.JWT_EXPIRES_IN;
    let blockTtlSeconds = 900; // default 15 minutes
    if (jwtExpiresStr.endsWith('d'))  blockTtlSeconds = parseInt(jwtExpiresStr) * 86400;
    else if (jwtExpiresStr.endsWith('h'))  blockTtlSeconds = parseInt(jwtExpiresStr) * 3600;
    else if (jwtExpiresStr.endsWith('m'))  blockTtlSeconds = parseInt(jwtExpiresStr) * 60;
    else if (jwtExpiresStr.endsWith('s'))  blockTtlSeconds = parseInt(jwtExpiresStr);

    // userId on WorkspaceMember is the workspace User.id — matches request.user.sub for non-impersonation tokens
    await blockMemberToken(workspaceId, member.userId, blockTtlSeconds)
        .catch(() => {}); // non-blocking — blocklist failure must not prevent removal
    // ──────────────────────────────────────────────────────────────────────────
}
