'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { Building2, Power, PowerOff, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface Workspace {
    id: string;
    name: string;
    slug: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'EXPIRED';
    planTier: string;
    createdAt: string;
    expiresAt: string | null;
    members: Array<{
        user: { name: string; email: string };
    }>;
    _count: {
        whatsAppAccounts: number;
        members: number;
    };
}

export default function AdminWorkspacesPage() {
    const { isAuthenticated, user } = useAuthStore();
    const router = useRouter();

    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        if (!isAuthenticated() || user?.role !== 'SUPER_ADMIN') {
            router.push('/admin/login');
            return;
        }
        fetchWorkspaces();
    }, [isAuthenticated, user, router]);

    const fetchWorkspaces = async () => {
        try {
            setIsLoading(true);
            const res = await api.get('/admin/workspaces');
            if (res.data?.success) {
                setWorkspaces(res.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch workspaces:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleStatus = async (id: string, currentStatus: string) => {
        const suspend = currentStatus === 'ACTIVE' || currentStatus === 'TRIAL';
        const actionStr = suspend ? 'suspend' : 'activate';
        
        if (!process.browser && typeof window !== 'undefined') return;
        if (!window.confirm(`Are you sure you want to ${actionStr} this workspace?`)) return;

        try {
            setActionLoading(id);
            const res = await api.post(`/admin/workspaces/${id}/suspend`, { suspend });
            if (res.data?.success) {
                await fetchWorkspaces();
            }
        } catch (error) {
            console.error('Failed to toggle status:', error);
            alert(`Failed to ${actionStr} workspace.`);
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case 'SUSPENDED': return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'TRIAL': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'EXPIRED': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 p-8 flex items-center justify-center">
                <Loader2 className="animate-spin text-red-600" size={32} />
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="w-14 h-14 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
                            <Building2 size={28} className="text-red-500" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-1">Dealer Directory</h1>
                            <p className="text-gray-400 text-sm">
                                Manage dealer workspaces, view active agents, and toggle access status.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Directory Table */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-950/50 text-gray-400 border-b border-gray-800 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Dealer Workspace</th>
                                    <th className="px-6 py-4 font-medium">Owner</th>
                                    <th className="px-6 py-4 font-medium">Status & Tier</th>
                                    <th className="px-6 py-4 font-medium">Limits</th>
                                    <th className="px-6 py-4 font-medium">Expiration</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50">
                                {workspaces.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                            No workspaces found.
                                        </td>
                                    </tr>
                                ) : (
                                    workspaces.map(ws => {
                                        const owner = ws.members?.[0]?.user;
                                        return (
                                            <tr key={ws.id} className="hover:bg-gray-800/20 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-200">{ws.name}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">Slug: {ws.slug}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {owner ? (
                                                        <>
                                                            <div className="text-gray-200">{owner.name}</div>
                                                            <div className="text-xs text-gray-500 mt-0.5">{owner.email}</div>
                                                        </>
                                                    ) : (
                                                        <span className="text-gray-500 italic">No Owner</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-2 items-start">
                                                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-widest border ${getStatusStyle(ws.status)}`}>
                                                            {ws.status}
                                                        </span>
                                                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                                                            {ws.planTier}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1.5 min-w-[120px]">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-gray-400">Agents:</span>
                                                            <span className="font-medium text-gray-200">{ws._count.members}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-gray-400">WA Nums:</span>
                                                            <span className="font-medium text-gray-200">{ws._count.whatsAppAccounts}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-gray-300">
                                                        {ws.expiresAt ? new Date(ws.expiresAt).toLocaleDateString() : 'Never'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleToggleStatus(ws.id, ws.status)}
                                                        disabled={actionLoading === ws.id}
                                                        className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                                            ws.status === 'ACTIVE' || ws.status === 'TRIAL'
                                                                ? 'text-red-400 border-red-500/30 hover:bg-red-500/10'
                                                                : 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'
                                                        } disabled:opacity-50`}
                                                    >
                                                        {actionLoading === ws.id ? (
                                                            <Loader2 size={14} className="animate-spin" />
                                                        ) : (
                                                            ws.status === 'ACTIVE' || ws.status === 'TRIAL' ? <PowerOff size={14} /> : <Power size={14} />
                                                        )}
                                                        {ws.status === 'ACTIVE' || ws.status === 'TRIAL' ? 'Suspend' : 'Activate'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
