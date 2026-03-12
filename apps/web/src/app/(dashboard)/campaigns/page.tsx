'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { Megaphone, Play, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

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

    const { data: campaignsData } = useQuery({
        queryKey: ['campaigns'],
        queryFn: () => api.get('/campaigns').then(r => r.data?.data?.campaigns ?? []),
    });

    const startMutation = useMutation({
        mutationFn: (id: string) => api.post(`/campaigns/${id}/start`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
    });

    const campaigns: any[] = campaignsData ?? [];

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
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { label: 'Sent', value: stats.sent ?? 0 },
                                            { label: 'Delivered', value: stats.delivered ?? 0 },
                                            { label: 'Failed', value: stats.failed ?? 0 },
                                        ].map(s => (
                                            <div key={s.label} className="rounded-lg p-2 text-center bg-elevated">
                                                <p className="font-bold text-lg text-primary">{s.value}</p>
                                                <p className="text-xs text-muted">{s.label}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {c.status === 'DRAFT' && hasPermission('campaigns:update') && (
                                    <button className="btn btn-primary self-start"
                                        onClick={() => startMutation.mutate(c.id)}
                                        disabled={startMutation.isPending}>
                                        <Play size={14} /> Launch
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
