/**
 * Auth-related TypeScript interfaces shared across apps.
 */

export interface TokenPayload {
    sub: string;         // userId
    workspaceId: string;
    role: string;
    type: 'access' | 'refresh';
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
