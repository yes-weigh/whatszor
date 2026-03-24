'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Settings, CheckCircle, AlertCircle, Clock, Activity, BarChart2, ServerCrash } from 'lucide-react';
import Link from 'next/link';

export default function KnowledgeBaseList() {
    const { data: q, isLoading } = useQuery({
        queryKey: ['products-list'],
        queryFn: () => api.get('/products').then(r => r.data)
    });

    const { data: m } = useQuery({
        queryKey: ['products-metrics'],
        queryFn: () => api.get('/products/metrics').then(r => r.data)
    });

    const { data: h } = useQuery({
        queryKey: ['system-health'],
        queryFn: () => api.get('/system/health').then(r => r.data)
    });

    const products = q?.data?.products || [];
    const metrics = m?.data || null;
    const health = h?.data || null;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'VERIFIED': return <span className="px-2 py-1 text-xs rounded-lg font-medium bg-success/20 text-success"><CheckCircle size={12} className="inline mr-1"/>Verified</span>;
            case 'PENDING_REVIEW': return <span className="px-2 py-1 text-xs rounded-lg font-medium bg-warning/20 text-warning"><Clock size={12} className="inline mr-1"/>Needs Review</span>;
            case 'INCOMPLETE': return <span className="px-2 py-1 text-xs rounded-lg font-medium bg-accent/20 text-accent"><AlertCircle size={12} className="inline mr-1"/>Incomplete</span>;
            default: return <span className="px-2 py-1 text-xs rounded-lg font-medium bg-muted/20 text-muted">{status}</span>;
        }
    }

    return (
        <div>
            <Header title="Product Knowledge Base" subtitle="Manage scraped and AI-extracted data for your products." />
            <div className="flex flex-col gap-6 p-6">
                
                {/* ── Observability & Health Dashboards ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* System Health */}
                    <div className="card w-full border-l-4 border-l-primary flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-3">
                            <Activity size={18} className="text-primary" />
                            <h2 className="font-semibold text-secondary">System Health (Live)</h2>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-theme)]">
                                <p className="text-xs text-muted mb-1">Queue Backlog</p>
                                <p className="text-lg font-bold text-primary">{health?.queueBacklog ?? '-'}</p>
                            </div>
                            <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-theme)]">
                                <p className="text-xs text-muted mb-1">Failed Jobs</p>
                                <p className="text-lg font-bold text-danger flex items-center gap-1">
                                    {health?.failedJobs ?? '-'} 
                                    {health?.failedJobs > 0 && <AlertCircle size={12}/>}
                                </p>
                            </div>
                            <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-theme)]">
                                <p className="text-xs text-muted mb-1">Avg Process Delay</p>
                                <p className="text-lg font-bold text-secondary">{health?.avgProcessingTimeMs ? `${health.avgProcessingTimeMs}ms` : '-'}</p>
                            </div>
                            <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-theme)]">
                                <p className="text-xs text-muted mb-1">Worker Status</p>
                                <p className="text-sm font-bold text-success mt-1">Operational</p>
                            </div>
                        </div>
                    </div>

                    {/* AI Analytics */}
                    <div className="card w-full border-l-4 border-l-accent flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-3">
                            <BarChart2 size={18} className="text-accent" />
                            <h2 className="font-semibold text-secondary">AI Ingestion Metrics</h2>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-theme)]">
                                <p className="text-xs text-muted mb-1">Total Sources</p>
                                <p className="text-lg font-bold text-primary">{metrics?.totalSources ?? '-'}</p>
                            </div>
                            <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-theme)]">
                                <p className="text-xs text-muted mb-1">Orphaned Rate</p>
                                <p className={`text-lg font-bold ${(metrics?.successRates?.orphanedRate || 0) > 20 ? 'text-warning' : 'text-success'}`}>{metrics?.successRates?.orphanedRate ?? '-'}%</p>
                            </div>
                            <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-theme)]">
                                <p className="text-xs text-muted mb-1">Failed Rate</p>
                                <p className={`text-lg font-bold ${(metrics?.successRates?.failedRate || 0) > 15 ? 'text-danger' : 'text-success'}`}>{metrics?.successRates?.failedRate ?? '-'}%</p>
                            </div>
                            <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-theme)]">
                                <p className="text-xs text-muted mb-1">Applied Rate</p>
                                <p className="text-lg font-bold text-accent">{metrics?.successRates?.appliedRate ?? '-'}%</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card w-full">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="font-semibold text-secondary">Knowledge Inventory</h2>
                        <button className="btn btn-primary text-sm px-4 py-2">Import CSV</button>
                    </div>

                    {isLoading ? (
                        <div className="text-center p-8 text-muted">Loading product data...</div>
                    ) : (
                        <div className="w-full overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--border-theme)] text-sm text-muted">
                                        <th className="pb-3 px-4 font-medium">SKU / Product Name</th>
                                        <th className="pb-3 px-4 font-medium">Category</th>
                                        <th className="pb-3 px-4 font-medium">Status</th>
                                        <th className="pb-3 px-4 font-medium">Completeness Target</th>
                                        <th className="pb-3 px-4 text-right font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map((p: any) => (
                                        <tr key={p.id} className="border-b border-[var(--border-theme)] hover:bg-[var(--bg-elevated)] transition-colors">
                                            <td className="py-4 px-4">
                                                <p className="font-medium text-primary">{p.name}</p>
                                                <p className="text-xs text-muted font-mono">{p.sku || 'NO-SKU'}</p>
                                            </td>
                                            <td className="py-4 px-4 text-sm text-secondary">{p.category || '—'}</td>
                                            <td className="py-4 px-4">{getStatusBadge(p.status)}</td>
                                            <td className="py-4 px-4">
                                                {p.missingFieldsCount > 0 ? (
                                                    <span className="text-xs text-warning">Missing {p.missingFieldsCount} fields</span>
                                                ) : <span className="text-xs text-success">Complete</span>}
                                            </td>
                                            <td className="py-4 px-4 text-right">
                                                <Link href={`/dashboard/knowledge/${p.id}`} className="text-sm font-medium text-accent hover:underline flex items-center justify-end gap-1">
                                                    <Settings size={14} /> Review
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                    {products.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-muted">No products found. Start by importing a CSV.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
