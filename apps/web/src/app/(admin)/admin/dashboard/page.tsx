'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Key, Users, LogOut, Copy, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

interface LicenseKey {
    id: string;
    key: string;
    planTier: string;
    durationDays: number;
    status: string;
    redeemedAt: string | null;
    createdAt: string;
    workspace?: { name: string; slug: string } | null;
}

export default function AdminDashboardPage() {
    const { user, logout } = useAuthStore();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [keys, setKeys] = useState<LicenseKey[]>([]);
    const [generating, setGenerating] = useState(false);

    // Form state
    const [planTier, setPlanTier] = useState('PRO');
    const [durationDays, setDurationDays] = useState(365);
    const [count, setCount] = useState(1);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => toast.success('Copied!')).catch(() => toast.error('Failed to copy'));
    };

    useEffect(() => {
        if (!user || user.role !== 'SUPER_ADMIN' && user.role !== 'STAFF') {
            router.push('/admin/login');
            return;
        }
        fetchKeys();
    }, [user, router]);

    const fetchKeys = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/licenses');
            setKeys(data.data);
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to fetch licenses');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setGenerating(true);
        try {
            await api.post('/licenses/generate', {
                planTier,
                durationDays: Number(durationDays),
                count: Number(count)
            });
            toast.success(`Generated ${count} new key(s)`);
            fetchKeys();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to generate keys');
        } finally {
            setGenerating(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-950"><RefreshCw className="animate-spin text-red-500" /></div>;
    }

    return (
        <div className="min-h-screen bg-gray-950 text-gray-200">
            {/* Sidebar */}
            <aside className="fixed top-0 left-0 w-64 h-full bg-gray-900 border-r border-gray-800">
                <div className="p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                        <Key className="text-red-500" /> Whatszor Admin
                    </h2>
                </div>
                <nav className="p-4 flex flex-col gap-2">
                    <Link href="/admin/dashboard" className="flex items-center gap-3 p-3 rounded-lg bg-gray-800 text-white font-medium">
                        <Key size={18} /> Licenses
                    </Link>
                    <Link href="/admin/workspaces" className="flex items-center gap-3 p-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
                        <Users size={18} /> Dealers
                    </Link>
                    <div className="flex-1" />
                    <button 
                        onClick={() => { logout(); router.push('/admin/login'); }}
                        className="flex items-center gap-3 p-3 rounded-lg text-gray-400 hover:text-red-400 transition-colors w-full text-left"
                    >
                        <LogOut size={18} /> Logout
                    </button>
                </nav>
            </aside>

            {/* Main content */}
            <main className="ml-64 p-8">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-white">License Management</h1>
                </div>

                {/* Generator Form */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 shadow-sm">
                    <h3 className="text-lg font-semibold text-white mb-4">Generate New Keys</h3>
                    <form onSubmit={handleGenerate} className="flex gap-4 items-end">
                        <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-xs font-medium text-gray-400">Plan Tier</label>
                            <select 
                                title="Plan Tier"
                                className="bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 focus:ring-red-500 focus:border-red-500"
                                value={planTier}
                                onChange={(e) => setPlanTier(e.target.value)}
                            >
                                <option value="STARTER">Starter</option>
                                <option value="PRO">Pro</option>
                                <option value="AGENCY">Agency</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-xs font-medium text-gray-400">Duration (Days)</label>
                            <select 
                                title="Duration Days"
                                className="bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 focus:ring-red-500 focus:border-red-500"
                                value={durationDays}
                                onChange={(e) => setDurationDays(Number(e.target.value))}
                            >
                                <option value={30}>30 Days (1 Month)</option>
                                <option value={180}>180 Days (6 Months)</option>
                                <option value={365}>365 Days (1 Year)</option>
                                <option value={3650}>Lifetime (10 Years)</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-[0.5]">
                            <label className="text-xs font-medium text-gray-400">Count</label>
                            <input 
                                type="number" 
                                title="Count"
                                placeholder="Number of keys"
                                min="1" max="100"
                                className="bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 focus:ring-red-500 focus:border-red-500"
                                value={count}
                                onChange={(e) => setCount(Number(e.target.value))}
                            />
                        </div>
                        <button type="submit" disabled={generating} className="bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm px-5 py-2.5 h-[42px] flex items-center disabled:opacity-50">
                            {generating ? <RefreshCw size={16} className="animate-spin" /> : 'Generate Keys'}
                        </button>
                    </form>
                </div>

                {/* Keys Table */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 border-b border-gray-800">
                            <tr>
                                <th className="px-6 py-4 font-medium">License Key</th>
                                <th className="px-6 py-4 font-medium">Plan</th>
                                <th className="px-6 py-4 font-medium">Duration</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Dealer/Workspace</th>
                                <th className="px-6 py-4 font-medium">Created On</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map(k => (
                                <tr key={k.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                                    <td className="px-6 py-4 font-mono text-white flex items-center gap-2">
                                        {k.key}
                                        <button 
                                            className="text-gray-500 hover:text-white" 
                                            title="Copy key"
                                            onClick={() => copyToClipboard(k.key)}
                                        >
                                            <Copy size={14} />
                                        </button>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="bg-gray-800 text-gray-300 text-xs font-semibold px-2.5 py-0.5 rounded border border-gray-700">{k.planTier}</span>
                                    </td>
                                    <td className="px-6 py-4">{k.durationDays} Days</td>
                                    <td className="px-6 py-4">
                                        {k.status === 'AVAILABLE' && <span className="text-emerald-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Available</span>}
                                        {k.status === 'REDEEMED' && <span className="text-blue-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /> Redeemed</span>}
                                        {k.status === 'REVOKED' && <span className="text-red-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /> Revoked</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        {k.workspace ? (
                                            <span className="text-white">{k.workspace.name} <span className="text-gray-500">({k.workspace.slug})</span></span>
                                        ) : (
                                            <span className="text-gray-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {format(new Date(k.createdAt), 'MMM d, yyyy')}
                                    </td>
                                </tr>
                            ))}
                            {keys.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        No license keys found. Generate some keys above to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
