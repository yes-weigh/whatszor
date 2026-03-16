import bcrypt from 'bcryptjs';
import { prisma } from '../../prisma/client';
import {
    signAccessToken,
    signRefreshToken,
    accessTokenTtlSeconds,
} from '../../core/jwt';
import type { AdminLoginInput, AuthTokens } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';

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
    return prisma.workspace.findMany({
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
}

export async function toggleWorkspaceStatus(id: string, suspended: boolean) {
    const status = suspended ? 'SUSPENDED' : 'ACTIVE';
    return prisma.workspace.update({
        where: { id },
        data: { status }
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
