import bcrypt from 'bcryptjs';
import { prisma } from '../../prisma/client';
import {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
    hashToken,
    parseExpiry,
    accessTokenTtlSeconds,
} from '../../core/jwt';
import { env } from '../../env';
import type { RegisterInput, LoginInput, AuthTokens } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';

const SALT_ROUNDS = 12;

// ── Registration ───────────────────────────────────────────

export async function registerUser(input: RegisterInput): Promise<AuthTokens> {
    const { name, email, password, workspaceName, workspaceSlug } = input;

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        const err = new Error('Email already registered') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.CONFLICT;
        err.statusCode = 409;
        throw err;
    }

    // Check slug uniqueness
    const existingWorkspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
    if (existingWorkspace) {
        const err = new Error('Workspace slug already taken') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.CONFLICT;
        err.statusCode = 409;
        throw err;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user + workspace + membership atomically
    const { user, workspace } = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: { name, email, passwordHash },
        });

        const workspace = await tx.workspace.create({
            data: {
                name: workspaceName,
                slug: workspaceSlug,
                status: 'ACTIVE',
                planTier: 'FREE',
                members: {
                    create: { userId: user.id, role: 'OWNER' },
                },
            },
        });

        return { user, workspace };
    });

    return issueTokens(user.id, workspace.id, 'OWNER');
}

// ── Login ──────────────────────────────────────────────────

export async function loginUser(input: LoginInput): Promise<AuthTokens> {
    const { email, password, workspaceSlug } = input;

    // Find workspace by slug
    const workspace = await prisma.workspace.findUnique({
        where: { slug: workspaceSlug },
        include: { members: { where: { user: { email } } } },
    });

    const member = workspace?.members[0];

    // Constant time comparison even on failure to prevent user enumeration
    const dummyHash = '$2a$12$invalidhashfortimingprotectiononly000000000000000000000';
    const passwordHash = member
        ? (await prisma.user.findUnique({ where: { id: member.userId } }))?.passwordHash ?? dummyHash
        : dummyHash;

    const valid = await bcrypt.compare(password, passwordHash);

    if (!workspace || !member || !valid) {
        const err = new Error('Invalid email, password, or workspace') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.INVALID_CREDENTIALS;
        err.statusCode = 401;
        throw err;
    }

    if (workspace.status === 'SUSPENDED') {
        const err = new Error('Workspace is suspended') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.WORKSPACE_SUSPENDED;
        err.statusCode = 403;
        throw err;
    }

    // Update lastLoginAt
    await prisma.user.update({
        where: { id: member.userId },
        data: { lastLoginAt: new Date() },
    });

    return issueTokens(member.userId, workspace.id, member.role);
}

// ── Token Refresh ──────────────────────────────────────────

export async function refreshTokens(rawRefreshToken: string): Promise<AuthTokens> {
    // Verify signature first
    let payload: Awaited<ReturnType<typeof verifyRefreshToken>>;
    try {
        payload = await verifyRefreshToken(rawRefreshToken);
    } catch {
        const err = new Error('Invalid or expired refresh token') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.TOKEN_EXPIRED;
        err.statusCode = 401;
        throw err;
    }

    const tokenHash = hashToken(rawRefreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
        const err = new Error('Refresh token revoked or expired') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.TOKEN_EXPIRED;
        err.statusCode = 401;
        throw err;
    }

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
    });

    // Get member's role
    const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: payload.workspaceId, userId: payload.sub } },
    });
    if (!member) {
        const err = new Error('Workspace membership not found') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.FORBIDDEN;
        err.statusCode = 403;
        throw err;
    }

    return issueTokens(payload.sub, payload.workspaceId, member.role);
}

// ── Logout ─────────────────────────────────────────────────

export async function logoutUser(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
    });
}

// ── Internal helpers ───────────────────────────────────────

async function issueTokens(userId: string, workspaceId: string, role: string): Promise<AuthTokens> {
    const tokenPayload = { sub: userId, workspaceId, role };

    const [accessToken, refreshToken] = await Promise.all([
        signAccessToken(tokenPayload),
        signRefreshToken(tokenPayload),
    ]);

    // Persist refresh token hash
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.create({
        data: {
            userId,
            workspaceId,
            tokenHash,
            expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN),
        },
    });

    return { accessToken, refreshToken, expiresIn: accessTokenTtlSeconds() };
}
