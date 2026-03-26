'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminLoginPage() {
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
            const { data } = await api.post('/admin/auth/login', { email, password });
            const { accessToken, refreshToken } = data.data as { accessToken: string; refreshToken: string };

            const [, payloadB64] = accessToken.split('.');
            const decoded = JSON.parse(
                atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
            );

            setAuth(
                {
                    id: decoded.sub,
                    name: 'Admin',
                    email,
                    workspaceId: decoded.workspaceId,
                    role: decoded.role,
                },
                accessToken,
                refreshToken
            );

            router.push('/admin/dashboard');
        } catch (err: any) {
            toast.error(err.response?.data?.error?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10 bg-red-500 blur-3xl" />
            </div>

            <div className="w-full max-w-sm relative z-10">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-red-600">
                        <ShieldCheck size={24} color="#fff" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
                    <p className="text-sm mt-1 text-gray-400">Authorized personnel only</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-gray-400">Email</label>
                        <input
                            type="email"
                            className="bg-gray-950 border border-gray-800 text-white text-sm rounded-lg block w-full p-2.5 focus:ring-red-500 focus:border-red-500"
                            placeholder="admin@whatsvue.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-gray-400">Password</label>
                        <div className="relative">
                            <input
                                type={showPw ? 'text' : 'password'}
                                className="bg-gray-950 border border-gray-800 text-white text-sm rounded-lg block w-full p-2.5 pr-10 focus:ring-red-500 focus:border-red-500"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                            <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw(s => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="w-full text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-900 font-medium rounded-lg text-sm px-5 py-2.5 text-center flex items-center justify-center disabled:opacity-50 mt-2" disabled={loading}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : 'Enter Portal'}
                    </button>
                </form>
            </div>
        </div>
    );
}
