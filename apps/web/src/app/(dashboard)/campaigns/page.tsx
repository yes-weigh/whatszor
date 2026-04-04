'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { Megaphone, Play, Clock, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const statusBadge: Record<string, string> = {
    DRAFT: 'badge-gray',
    ACTIVE: 'badge-blue',
    RUNNING: 'badge-yellow',
    COMPLETED: 'badge-green',
    FAILED: 'badge-red',
};

const statusIcon: Record<string, React.ElementType> = {
    DRAFT: Clock,
    ACTIVE: Play,
    RUNNING: Play,
    COMPLETED: CheckCircle2,
    FAILED: XCircle,
};

export default function CampaignsPage() {
    const qc = useQueryClient();
    const router = useRouter();
    const hasPermission = useAuthStore(s => s.hasPermission);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const { data: campaignsData } = useQuery({
        queryKey: ['campaigns'],
        queryFn: () => api.get('/campaigns').then(r => r.data),
        refetchInterval: (query) => {
            const data: any = query.state.data;
            return data?.campaigns?.some((c: any) => c.status === 'RUNNING') ? 3000 : false;
        }
    });

    const startMutation = useMutation({
        mutationFn: (id: string) => api.post(`/campaigns/${id}/start`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
    });

    const cancelMutation = useMutation({
        mutationFn: (id: string) => api.post(`/campaigns/${id}/cancel`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/campaigns/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
    });

    const campaigns: any[] = Array.isArray(campaignsData?.campaigns) ? campaignsData.campaigns : [];

    if (!mounted) return null;

    return (
        <div>
            <Header title="Campaigns" subtitle="Broadcast message manager" />
            <div className="p-6 flex flex-col gap-4">
                <div className="flex justify-end">
                    {hasPermission('campaigns:create') && (
                        <button onClick={() => router.push('/campaigns/new')} className="btn btn-primary">+ New Campaign</button>
                    )}
                </div>

                {campaigns.length === 0 && (
                    <div className="card flex flex-col items-center gap-3 py-16">
                        <Megaphone size={40} className="text-strong" />
                        <p className="text-sm text-muted">No campaigns yet. Create your first broadcast!</p>
                        {hasPermission('campaigns:create') && (
                            <button onClick={() => router.push('/campaigns/new')} className="btn btn-primary">+ New Campaign</button>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {campaigns.map((c: any) => {
                        const Icon = statusIcon[c.status] || Clock;
                        const stats = c.stats as any;
                        const sentCount = stats?.sent ?? 0;
                        const failedCount = stats?.failed ?? 0;
                        const progress = stats ? Math.min(100, Math.max(0, Math.round(((sentCount + failedCount) / Math.max(c._count?.members || 1, 1)) * 100))) : 0;
                        const progressStyle = { width: `${progress}%` };
                        return (
                            <div key={c.id} className="card flex flex-col gap-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="font-semibold text-primary">{c.name}</h3>
                                        <p className="text-xs mt-0.5 text-muted">
                                            {c._count?.members ?? 0} recipients
                                        </p>
                                    </div>
                                    <span className={`badge ${statusBadge[c.status] || 'badge-gray'}`}>
                                        <Icon size={10} />
                                        {c.status}
                                    </span>
                                </div>

                                {stats && (
                                    <>
                                        {c.status === 'RUNNING' && (
                                            <div className="w-full bg-border rounded-full h-2 mb-2">
                                                <div
                                                    className="bg-primary h-2 rounded-full transition-all duration-500"
                                                    style={progressStyle}
                                                ></div>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-4 gap-2">
                                            {[
                                                { label: 'Sent', value: stats.sent ?? 0 },
                                                { label: 'Delivered', value: stats.delivered ?? 0 },
                                                { label: 'Failed', value: stats.failed ?? 0 },
                                                { label: 'Replies', value: stats.replies ?? '0' },
                                            ].map(s => (
                                                <div key={s.label} className="rounded-lg p-2 text-center bg-elevated border border-border/50">
                                                    <p className="font-bold text-lg text-primary">{s.value}</p>
                                                    <p className="text-xs text-muted">{s.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {c.status === 'RUNNING' && (
                                    <div className="bg-primary/10 border border-primary/20 text-primary rounded-md p-3 text-sm flex items-center gap-2">
                                        <Megaphone size={16} />
                                        <span>Campaign running! Replies will appear in Inbox &rarr; AI will assist.</span>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    {c.status === 'DRAFT' && hasPermission('campaigns:update') && (
                                        <button className="btn btn-primary self-start"
                                            onClick={() => startMutation.mutate(c.id)}
                                            disabled={startMutation.isPending}>
                                            <Play size={14} /> Launch
                                        </button>
                                    )}
                                    {c.status === 'RUNNING' && hasPermission('campaigns:update') && (
                                        <button className="btn btn-ghost text-yellow-500 self-start hover:bg-yellow-500/10"
                                            onClick={() => {
                                                if (confirm('Are you sure you want to stop this campaign?')) {
                                                    cancelMutation.mutate(c.id);
                                                }
                                            }}
                                            disabled={cancelMutation.isPending}>
                                            <XCircle size={14} /> Stop
                                        </button>
                                    )}
                                    {c.status !== 'RUNNING' && hasPermission('campaigns:delete') && (
                                        <button className="btn btn-ghost text-red-500 self-start"
                                            onClick={() => {
                                                if (confirm('Are you sure you want to delete this campaign?')) {
                                                    deleteMutation.mutate(c.id);
                                                }
                                            }}
                                            disabled={deleteMutation.isPending}>
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
