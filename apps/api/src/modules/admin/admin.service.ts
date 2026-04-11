import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../../prisma/client';
import {
    signAccessToken,
    signRefreshToken,
    signImpersonationToken,
    parseExpiry,
    accessTokenTtlSeconds,
} from '../../core/jwt';
import { logEvent } from '../../core/event-logger';
import type { AdminLoginInput, AuthTokens } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';
import { env } from '../../env';

export async function loginAdmin(input: AdminLoginInput): Promise<AuthTokens> {
    const { email, password } = input;

    const dummyHash = '$2a$12$invalidhashfortimingprotectiononly000000000000000000000';
    
    const admin = await prisma.globalUser.findUnique({ where: { email } });
    const passwordHash = admin?.password ?? dummyHash;
    
    const valid = await bcrypt.compare(password, passwordHash);

    if (!admin || !valid) {
        const err = new Error('Invalid email or password') as Error & { code: string; statusCode: number };
        err.code = ErrorCodes.INVALID_CREDENTIALS;
        err.statusCode = 401;
        throw err;
    }

    // Role will be admin.role, workspaceId dummy value for Admins
    return issueAdminTokens(admin.id, admin.role);
}
// ── Admin Workspace Management ───────────────────────────────

export async function getWorkspaces() {
    const workspaces = await prisma.workspace.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            members: {
                where: { role: 'OWNER' },
                include: { user: { select: { name: true, email: true } } }
            },
            _count: {
                select: { whatsAppAccounts: true, members: true }
            }
        }
    });

    return workspaces.map(ws => ({
        ...ws,
        storageUsedBytes: Number(ws.storageUsedBytes),
        storageLimitBytes: Number(ws.storageLimitBytes)
    }));
}

export async function toggleWorkspaceStatus(id: string, suspended: boolean, adminId: string) {
    const status = suspended ? 'SUSPENDED' : 'ACTIVE';
    const workspace = await prisma.workspace.update({
        where: { id },
        data: { status }
    });

    // Audit log — non-blocking
    const eventType = suspended ? 'workspace_suspended' : 'workspace_activated';
    logEvent(id, eventType, 'admin_panel', { adminId, status });

    return workspace;
}

// ── Impersonation ─────────────────────────────────────────────
// Super-admin single-use entry into a workspace as its OWNER.
// Issues a short-lived, cryptographically distinct JWT.
// Every entry is recorded in ImpersonationLog for compliance.

export interface ImpersonateResult {
    token: string;       // Short-lived impersonation JWT
    expiresAt: Date;     // When the token expires
    logId: string;       // ImpersonationLog.id for reference
}

export async function impersonateWorkspace(
    adminId: string,
    workspaceId: string,
    ipAddress?: string,
    userAgent?: string,
): Promise<ImpersonateResult> {
    // 1. Verify workspace exists and is not suspended
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { status: true },
    });
    if (!workspace) {
        throw Object.assign(new Error('Workspace not found'), {
            code: ErrorCodes.NOT_FOUND,
            statusCode: 404,
        });
    

    }
    if (workspace.status === 'SUSPENDED') {
        throw Object.assign(
            new Error('Cannot impersonate a suspended workspace — activate it first'),
            { code: ErrorCodes.FORBIDDEN, statusCode: 403 },
        );
    }

    // 2. Generate a one-off JTI for DB-backed revocation
    const jti = randomBytes(32).toString('hex');
    const expiresAt = parseExpiry(env.IMPERSONATION_TTL);

    // 3. Write audit log BEFORE issuing the token
    const log = await prisma.impersonationLog.create({
        data: {
            globalUserId: adminId,
            workspaceId,
            tokenJti: jti,
            expiresAt,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
        },
    });

    // 4. Issue the impersonation token
    const token = await signImpersonationToken({
        sub: adminId,
        workspaceId,
        role: 'OWNER',
        jti,
        impersonatedBy: adminId,
    });

    // 5. Audit event log (async, non-blocking)
    logEvent(workspaceId, 'admin_impersonation', 'admin_panel', {
        adminId,
        logId: log.id,
        ipAddress,
    });

    return { token, expiresAt, logId: log.id };
}

export async function revokeImpersonation(jti: string, _adminId: string): Promise<void> {
    const log = await prisma.impersonationLog.findUnique({ where: { tokenJti: jti } });
    if (!log) {
        throw Object.assign(new Error('Impersonation log not found'), {
            code: ErrorCodes.NOT_FOUND,
            statusCode: 404,
        });
    }
    if (log.revokedAt) return; // Already revoked — idempotent

    await prisma.impersonationLog.update({
        where: { tokenJti: jti },
        data: { revokedAt: new Date() },
    });
}
// ── Internal helpers ───────────────────────────────────────

async function issueAdminTokens(userId: string, role: string): Promise<AuthTokens> {
    const workspaceId = 'ADMIN_WORKSPACE';
    const tokenPayload = { sub: userId, workspaceId, role };

    const [accessToken, refreshToken] = await Promise.all([
        signAccessToken(tokenPayload),
        signRefreshToken(tokenPayload),
    ]);

    // Note: Admin sessions do NOT persist refresh tokens to the DB.
    // Admin tokens are stored client-side only (stateless).
    // This avoids FK violations since GlobalUser.id != User.id.

    return { accessToken, refreshToken, expiresIn: accessTokenTtlSeconds() };
}
