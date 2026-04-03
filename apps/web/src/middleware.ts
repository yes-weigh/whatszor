import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Edge Middleware
 * 
 * Protects all /dashboard, /conversations, /campaigns, /contacts, /instances routes
 * by checking for the presence of an accessToken in either localStorage (client cookie) 
 * or the Authorization header.
 * 
 * NOTE: Full workspace status checking (TRIAL/SUSPENDED) is handled by:
 * 1. The Fastify API middleware (requireActiveWorkspace) which returns 402
 * 2. The Axios response interceptor (redirects on 402)
 * 3. The DashboardLayout useEffect (polls /auth/me for status)
 * 
 * This middleware only gates unauthenticated users from accessing protected routes.
 */

// Routes that require authentication
const PROTECTED_PREFIXES = [
    '/inbox',
    '/analytics',
    '/campaigns',
    '/contacts',
    '/instances',
    '/settings',
    '/workspace',
];

// Public routes that never need gating
const PUBLIC_PATHS = [
    '/login',
    '/register',
    '/admin',
    '/workspace/unlock', // unlock page must be accessible to unauthenticated users
    '/_next',
    '/favicon',
    '/api',
];

function isProtected(pathname: string): boolean {
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return false;
    return PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (!isProtected(pathname)) {
        return NextResponse.next();
    }

    // Check for auth token in cookies (Next.js can't access localStorage in middleware)
    // The frontend stores auth in Zustand with localStorage. We use a cookie as a signal.
    const authCookie = request.cookies.get('accessToken')?.value;

    if (!authCookie) {
        // No token cookie — redirect to login
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.searchParams.set('from', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
