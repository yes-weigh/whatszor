'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { Bot, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const { setAuth } = useAuthStore();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { data } = await api.post('/auth/login', { email, password });
            const { accessToken, refreshToken } = data as { accessToken: string; refreshToken: string };

            // Decode JWT payload (base64url) — signed but not encrypted, safe to read client-side.
            const [, payloadB64] = accessToken.split('.');
            const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
            const padLength = (4 - (base64.length % 4)) % 4;
            const padded = base64 + '='.repeat(padLength);
            const decoded = JSON.parse(atob(padded));

            // Immediately hydrate the store with role so permission checks work at once.
            setAuth(
                {
                    id: decoded.sub,
                    name: email.split('@')[0],
                    email,
                    workspaceId: decoded.workspaceId,
                    role: decoded.role,
                },
                accessToken,
                refreshToken
            );

            // Fire-and-forget: enrich user name from /auth/me (uses the token we just set).
            api.get('/auth/me')
                .then(res => {
                    const me = res.data as any;
                    if (me) {
                        setAuth({ id: me.id, name: me.name, email: me.email, workspaceId: me.workspaceId, role: me.role }, accessToken, refreshToken);
                    }
                })
                .catch(() => { /* non-critical */ });

            router.push('/inbox');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-base relative">
            {/* Back to Home UI */}
            <Link href="/" className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors">
                <ArrowLeft size={16} />
                <span>Back to Home</span>
            </Link>

            {/* Background glow */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-20 bg-glow-blue" />
            </div>

            <div className="w-full max-w-sm relative">
                {/* Brand */}
                <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-accent">
                        <Bot size={24} color="#fff" />
                    </div>
                    <h1 className="text-2xl font-bold text-primary">Welcome back</h1>
                    <p className="text-sm mt-1 text-muted">Sign in to your Whatsvue organization</p>
                </div>

                {/* Card */}
                <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-secondary">Email</label>
                        <input
                            type="email"
                            className="input"
                            placeholder="you@company.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-secondary">Password</label>
                        <div className="relative">
                            <input
                                type={showPw ? 'text' : 'password'}
                                className="input pr-10"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                            <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw(s => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>


                    <button type="submit" className="btn btn-primary w-full mt-1" disabled={loading}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : 'Sign In'}
                    </button>

                    <p className="text-center text-xs text-muted">
                        Don&apos;t have an account?{' '}
                        <a href="/register" className="text-accent">Create organization</a>
                    </p>
                </form>
            </div>
        </div>
    );
}
