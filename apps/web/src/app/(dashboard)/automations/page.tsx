'use client';
import React from 'react';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { Zap, CheckCircle2, PauseCircle, Activity, LayoutGrid, Sparkles, AlertTriangle, Clock, Server, ToggleLeft, ToggleRight, Trash2, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';

const statusBadge: Record<string, string> = {
    ACTIVE: 'badge-green',
    DRAFT: 'badge-gray',
    INACTIVE: 'badge-yellow',
};

export default function AutomationsPage() {
    const qc = useQueryClient();
    const router = useRouter();
    const hasPermission = useAuthStore(s => s.hasPermission);

    const { data: rulesData } = useQuery({
        queryKey: ['automations'],
        queryFn: () => api.get('/automations').then(r => r.data?.data ?? []),
    });

    const [confirmingId, setConfirmingId] = React.useState<string | null>(null);

    const toggleMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            api.patch(`/automations/${id}`, { status }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/automations/${id}`),
        onSuccess: () => { setConfirmingId(null); qc.invalidateQueries({ queryKey: ['automations'] }); },
        onError: (err: any) => { console.error('Delete failed:', err); setConfirmingId(null); },
    });

    const { data: metricsData } = useQuery({
        queryKey: ['observability_metrics'],
        queryFn: () => api.get('/observability/metrics').then(r => r.data?.data),
    });

    const rules: any[] = rulesData ?? [];
    const metrics = metricsData || { totalExecutions: 0, failedNodes: 0, averageDurationMs: 0 };

    return (
        <div>
            <Header title="Automations" subtitle="IFTTT rule engine" />
            <div className="p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    {hasPermission('automation:create') && (
                        <>
                            <button onClick={() => router.push('/automations/create?ai=1')} className="btn bg-elevated border border-blue-500/30 text-blue-400 hover:text-blue-300 flex items-center gap-2">
                                <Sparkles size={16} />
                                AI Generate
                            </button>
                            <button onClick={() => router.push('/automations/templates')} className="btn bg-elevated border border-theme text-secondary hover:text-primary flex items-center gap-2">
                                <LayoutGrid size={16} />
                                Browse Templates
                            </button>
                            <button onClick={() => router.push('/automations/create')} className="btn btn-primary">+ New Rule</button>
                        </>
                    )}
                </div>

                {/* Metrics Widget */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div className="card p-4 flex items-center justify-between border-theme bg-elevated/50">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted font-medium uppercase tracking-wider">Total Runs</span>
                            <span className="text-2xl font-bold text-primary">{metrics.totalExecutions.toLocaleString()}</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Server size={20} />
                        </div>
                    </div>
                    
                    <div className="card p-4 flex items-center justify-between border-theme bg-elevated/50">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted font-medium uppercase tracking-wider">Node Failures</span>
                            <span className="text-2xl font-bold text-red-500">{metrics.failedNodes.toLocaleString()}</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                            <AlertTriangle size={20} />
                        </div>
                    </div>
                    
                    <div className="card p-4 flex items-center justify-between border-theme bg-elevated/50">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted font-medium uppercase tracking-wider">Avg Node Speed</span>
                            <span className="text-2xl font-bold text-emerald-500">{Math.round(metrics.averageDurationMs) || 0}ms</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <Clock size={20} />
                        </div>
                    </div>

                    <div 
                        onClick={() => router.push('/automations/events')}
                        className="card p-4 flex items-center justify-between border-theme bg-surface hover:bg-elevated/80 hover:border-blue-500/30 cursor-pointer transition-all group"
                    >
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-blue-400 font-bold uppercase tracking-wider">Event Timeline</span>
                            <span className="text-sm font-medium text-secondary group-hover:text-primary transition-colors">View global platform tracing &rarr;</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                            <Activity size={20} />
                        </div>
                    </div>
                </div>

                {rules.length === 0 && (
                    <div className="card flex flex-col items-center gap-3 py-16">
                        <Zap size={40} className="text-strong" />
                        <p className="text-sm text-muted">
                            No automation rules yet. Create your first workflow!
                        </p>
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    {rules.map((r: any) => {
                        const isActive = r.status === 'ACTIVE';
                        return (
                            <div 
                                key={r.id} 
                                className="card flex items-start gap-4 cursor-pointer hover:border-theme transition-colors group"
                                onClick={() => router.push(`/automations/create?ruleId=${r.id}`)}
                            >
                                {/* Trigger icon */}
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-success/10' : 'bg-elevated'}`}>
                                    <Zap size={18} className={isActive ? 'text-success' : 'text-muted'} />
                                </div>

                                 {/* Info */}
                                 <div className="flex-1 min-w-0">
                                     <div className="flex items-center gap-2 flex-wrap">
                                         <h3 
                                            className="font-semibold text-sm text-primary cursor-pointer hover:underline transition-colors"
                                            onClick={() => router.push(`/automations/create?ruleId=${r.id}`)}
                                         >
                                            {r.name}
                                         </h3>
                                         <span className={`badge ${statusBadge[r.status] || 'badge-gray'}`}>{r.status}</span>
                                     </div>
                                     {r.description && (
                                         <p className="text-xs mt-0.5 truncate text-muted">{r.description}</p>
                                     )}
                                     <div className="flex items-center gap-3 mt-2">
                                         <div className="flex items-center gap-1 text-xs text-secondary">
                                             <CheckCircle2 size={12} />
                                             Trigger: <code className="text-xs px-1.5 py-0.5 rounded bg-elevated">
                                                 {(r.trigger as any)?.type}
                                             </code>
                                         </div>
                                         <div className="flex items-center gap-1 text-xs text-secondary">
                                             <PauseCircle size={12} />
                                             {r.flowDefinition?.nodes?.length ? r.flowDefinition.nodes.filter((n: any) => n.type !== 'trigger').length : (Array.isArray(r.actions) ? r.actions.length : 0)} node(s)
                                         </div>
                                         <div className="flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-0.5 rounded-full ml-auto">
                                             <Activity size={12} />
                                             {r._count?.executions || 0} run(s)
                                         </div>
                                     </div>
                                 </div>

                                 {/* Actions */}
                                 <div className="flex items-center gap-2 shrink-0">
                                     {hasPermission('automation:update') && (
                                         <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                                             <button
                                                 aria-label="Edit rule"
                                                 title="Edit rule"
                                                 onClick={() => router.push(`/automations/create?ruleId=${r.id}`)}
                                                 className="btn btn-ghost p-2"
                                             >
                                                 <Pencil size={18} className="text-blue-400 hover:text-blue-300" />
                                             </button>
                                             <button
                                                 aria-label={isActive ? 'Disable rule' : 'Enable rule'}
                                                 title={isActive ? 'Disable rule' : 'Enable rule'}
                                                 onClick={() => toggleMutation.mutate({ id: r.id, status: isActive ? 'INACTIVE' : 'ACTIVE' })}
                                                 className="btn btn-ghost p-2"
                                             >
                                                 {isActive
                                                     ? <ToggleRight size={18} className="text-success" />
                                                     : <ToggleLeft size={18} className="text-muted" />}
                                             </button>
                                         </div>
                                     )}
                                     {hasPermission('automation:delete') && (
                                         <div onClick={(e) => e.stopPropagation()}>
                                             {confirmingId === r.id ? (
                                             <button
                                                 aria-label="Confirm delete"
                                                 title="Click again to confirm delete"
                                                 onClick={() => deleteMutation.mutate(r.id)}
                                                 className="btn btn-ghost p-2 text-red-500 text-xs font-bold"
                                             >
                                                 Confirm?
                                             </button>
                                         ) : (
                                             <button
                                                 aria-label="Delete rule"
                                                 title="Delete rule"
                                                 onClick={() => setConfirmingId(r.id)}
                                                 className="btn btn-ghost p-2"
                                             >
                                                 <Trash2 size={15} className="text-danger hover:text-red-400" />
                                             </button>
                                         )}
                                         </div>
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
