'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { Bot, Loader2 } from 'lucide-react';

export default function RegisterPage() {
    const [form, setForm] = useState({ name: '', email: '', password: '', workspaceName: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setAuth } = useAuthStore();
    const router = useRouter();

    const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const slug = form.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const payload = { ...form, workspaceSlug: slug };
            // Step 1: Register — returns tokens only (no user object)
            const { data } = await api.post('/auth/register', payload);
            const { accessToken, refreshToken } = data.data;

            // Step 2: Store the token so /auth/me can use it
            localStorage.setItem('accessToken', accessToken);
            if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
            document.cookie = `accessToken=${accessToken}; path=/; SameSite=Strict`;

            // Step 3: Fetch the user profile so setAuth has a valid user object
            const meRes = await api.get('/auth/me');
            const me = meRes.data?.data;
            if (!me) throw new Error('Could not retrieve user profile after registration');

            // Step 4: Persist auth state and redirect to license activation
            // New workspaces start as TRIAL — they must activate a license before accessing the dashboard
            setAuth({ id: me.id, name: me.name, email: me.email, workspaceId: me.workspaceId, role: me.role }, accessToken, refreshToken);
            router.push('/workspace/unlock');
        } catch (err: any) {
            // Clear partial auth on failure
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            document.cookie = 'accessToken=; path=/; max-age=0';
            setError(err.response?.data?.error?.message || err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-base">
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-20 bg-glow-purple" />
            </div>
            <div className="w-full max-w-sm relative">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-accent">
                        <Bot size={24} color="#fff" />
                    </div>
                    <h1 className="text-2xl font-bold text-primary">Create workspace</h1>
                    <p className="text-sm mt-1 text-muted">Set up your Whatsvue account in seconds</p>
                </div>

                <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
                    {[
                        { key: 'workspaceName', label: 'Workspace Name', placeholder: 'Acme Corp', type: 'text' },
                        { key: 'name', label: 'Your Name', placeholder: 'Rahul Mehta', type: 'text' },
                        { key: 'email', label: 'Email', placeholder: 'you@company.com', type: 'email' },
                        { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password' },
                    ].map(f => (
                        <div key={f.key} className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-secondary">{f.label}</label>
                            <input type={f.type} className="input" placeholder={f.placeholder}
                                value={(form as any)[f.key]} onChange={set(f.key)} required />
                        </div>
                    ))}

                    {error && (
                        <div className="text-xs px-3 py-2 rounded-lg bg-danger/10 text-danger">{error}</div>
                    )}

                    <button type="submit" className="btn btn-primary w-full mt-1" disabled={loading}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : 'Create Workspace'}
                    </button>

                    <p className="text-center text-xs text-muted">
                        Already have an account? <a href="/login" className="text-accent">Sign in</a>
                    </p>
                </form>
            </div>
        </div>
    );
}
