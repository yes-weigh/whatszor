import { prisma } from '../../prisma/client';
import type { UpdateWorkspaceInput, InviteMemberInput } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';

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

    return workspace;
}

export async function updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput) {
    return prisma.workspace.update({
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
            settings: true,
            updatedAt: true,
        },
    });
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
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
    }));
}

export async function inviteMember(workspaceId: string, input: InviteMemberInput) {
    const { email, role } = input;

    // Find user by email — they must already have an account
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        const err = new Error('User not found. They must register first.') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.NOT_FOUND;
        err.statusCode = 404;
        throw err;
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

export async function updateMemberRole(workspaceId: string, memberId: string, newRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') {
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

    const updated = await prisma.workspaceMember.update({
        where: { id: memberId },
        data: { role: newRole },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }
    });
    
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
}
