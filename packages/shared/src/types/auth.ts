/**
 * Auth-related TypeScript interfaces shared across apps.
 */

export interface TokenPayload {
    sub: string;         // userId (workspace User.id) OR GlobalUser.id when isImpersonating=true
    workspaceId: string;
    role: string;
    type: 'access' | 'refresh' | 'impersonation';
    /** Set to true when the caller is a super-admin using an impersonation token.
     *  When true: sub = GlobalUser.id (NOT a workspace User record).
     *  Code that queries User by sub MUST check this flag first. */
    isImpersonating?: boolean;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // seconds
}

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
    workspaceId: string;
    role: string;
}
