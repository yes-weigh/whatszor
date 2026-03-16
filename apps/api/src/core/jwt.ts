import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomBytes } from 'crypto';
import { env } from '../env';
import type { TokenPayload } from '@whatszor/shared';

const ACCESS_SECRET = new TextEncoder().encode(env.JWT_SECRET + ':access');
const REFRESH_SECRET = new TextEncoder().encode(env.JWT_SECRET + ':refresh');

const ACCESS_TTL = env.JWT_EXPIRES_IN;         // e.g. "15m"
const REFRESH_TTL = env.JWT_REFRESH_EXPIRES_IN; // e.g. "30d"

// ── Token creation ─────────────────────────────────────────

export async function signAccessToken(payload: Omit<TokenPayload, 'type'>): Promise<string> {
    return new SignJWT({ ...payload, type: 'access' } as JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(ACCESS_TTL)
        .setIssuer('whatszor')
        .sign(ACCESS_SECRET);
}

export async function signRefreshToken(payload: Omit<TokenPayload, 'type'>): Promise<string> {
    // Add jti (unique ID) to allow per-token revocation
    const jti = randomBytes(32).toString('hex');
    return new SignJWT({ ...payload, type: 'refresh', jti } as JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(REFRESH_TTL)
        .setIssuer('whatszor')
        .sign(REFRESH_SECRET);
}

// ── Token verification ─────────────────────────────────────

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, ACCESS_SECRET, {
        issuer: 'whatszor',
    });
    return payload as unknown as TokenPayload;
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload & { jti: string }> {
    const { payload } = await jwtVerify(token, REFRESH_SECRET, {
        issuer: 'whatszor',
    });
    return payload as unknown as TokenPayload & { jti: string };
}

// ── Helpers ────────────────────────────────────────────────

/**
 * SHA-256 hash of the raw refresh token string.
 * Stored in DB so we never persist the raw token.
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** Parse expiry string like "30d" into a future Date */
export function parseExpiry(ttl: string): Date {
    const unit = ttl.slice(-1);
    const value = parseInt(ttl.slice(0, -1), 10);
    const now = new Date();
    if (unit === 'm') now.setMinutes(now.getMinutes() + value);
    if (unit === 'h') now.setHours(now.getHours() + value);
    if (unit === 'd') now.setDate(now.getDate() + value);
    return now;
}

/** Access token TTL in seconds (for the expiresIn response field) */
export function accessTokenTtlSeconds(): number {
    const unit = ACCESS_TTL.slice(-1);
    const value = parseInt(ACCESS_TTL.slice(0, -1), 10);
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    if (unit === 'd') return value * 86400;
    return 900; // 15m fallback
}
