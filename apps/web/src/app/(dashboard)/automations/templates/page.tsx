'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Header } from '@/components/layout/Header';
import {
    Zap, MessageSquare, Tag, Clock, Users, CalendarClock,
    ChevronRight, Download, Loader2, Search, X, Sparkles
} from 'lucide-react';

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
    lead_capture:  { label: 'Lead Capture',       icon: <Zap size={16} />,          color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
    support:       { label: 'Customer Support',    icon: <MessageSquare size={16} />, color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20' },
    dealer:        { label: 'Dealer Inquiry',      icon: <Tag size={16} />,           color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
    campaign:      { label: 'Campaign Follow-Up',  icon: <Clock size={16} />,         color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
    appointment:   { label: 'Appointment Booking', icon: <CalendarClock size={16} />, color: 'text-emerald-400',bg: 'bg-emerald-400/10 border-emerald-400/20' },
};

const ALL_CATEGORIES = ['all', ...Object.keys(CATEGORY_META)];

function TemplateCard({ template, onInstall, installing }: { template: any; onInstall: (t: any) => void; installing: boolean }) {
    const meta = CATEGORY_META[template.category] || { label: template.category, icon: <Zap size={16} />, color: 'text-primary', bg: 'bg-elevated border-theme' };
    const nodeCount = (template.flowDefinition?.nodes || []).length;

    return (
        <div className="card group hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-200 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-semibold ${meta.bg} ${meta.color}`}>
                    {meta.icon}
                    {meta.label}
                </div>
                <div className="text-[11px] text-muted">{nodeCount} nodes</div>
            </div>

            {/* Content */}
            <div className="flex flex-col gap-1 flex-1">
                <h3 className="font-semibold text-primary text-[15px] leading-tight">{template.name}</h3>
                <p className="text-sm text-muted leading-relaxed">{template.description}</p>
            </div>

            {/* Node preview pills */}
            <div className="flex flex-wrap gap-1">
                {(template.flowDefinition?.nodes || []).slice(0, 4).map((n: any) => (
                    <span key={n.id} className="text-[10px] px-2 py-0.5 bg-elevated border border-theme rounded-full text-secondary capitalize">
                        {n.type}
                    </span>
                ))}
                {nodeCount > 4 && <span className="text-[10px] px-2 py-0.5 bg-elevated border border-theme rounded-full text-muted">+{nodeCount - 4} more</span>}
            </div>

            {/* Install button */}
            <button
                onClick={() => onInstall(template)}
                disabled={installing}
                className="w-full btn btn-primary flex items-center justify-center gap-2 text-sm"
            >
                {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Use Template
                <ChevronRight size={14} className="opacity-60" />
            </button>
        </div>
    );
}

export default function TemplateGalleryPage() {
    const router = useRouter();
    const [activeCategory, setActiveCategory] = useState('all');
    const [search, setSearch] = useState('');
    const [installingId, setInstallingId] = useState<string | null>(null);

    const { data: templates = [], isLoading } = useQuery({
        queryKey: ['automationTemplates'],
        queryFn: () => api.get('/automations/templates').then(r => r.data?.data ?? []),
    });

    const filtered = templates.filter((t: any) => {
        const matchCat = activeCategory === 'all' || t.category === activeCategory;
        const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
    });

    const handleInstall = async (template: any) => {
        setInstallingId(template.id);
        try {
            const res = await api.post(`/automations/templates/${template.id}/install`);
            const ruleId = res.data?.data?.rule?.id;
            if (ruleId) {
                router.push(`/automations/create?ruleId=${ruleId}`);
            }
        } catch (err) {
            console.error('Install failed', err);
        } finally {
            setInstallingId(null);
        }
    };

    return (
        <div>
            <Header title="Template Gallery" subtitle="Start with a pre-built automation — customize in the Flow Builder" />

            <div className="p-6 flex flex-col gap-6">
                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    {/* Search */}
                    <div className="relative w-full sm:w-80">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search templates..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="input pl-9 pr-8 w-full text-sm"
                        />
                        {search && (
                            <button aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Back button */}
                    <button onClick={() => router.push('/automations')} className="btn btn-ghost text-sm flex items-center gap-2 text-muted hover:text-primary">
                        ← Back to Automations
                    </button>
                </div>

                {/* Category tabs */}
                <div className="flex flex-wrap gap-2">
                    {ALL_CATEGORIES.map(cat => {
                        const meta = cat === 'all' ? null : CATEGORY_META[cat];
                        return (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                                    activeCategory === cat
                                        ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                                        : 'bg-elevated border-theme text-secondary hover:text-primary hover:border-blue-500/30'
                                }`}
                            >
                                {meta?.icon}
                                {meta?.label || 'All Templates'}
                            </button>
                        );
                    })}
                </div>

                {/* AI Generator CTA */}
                <div className="rounded-xl border border-dashed border-blue-500/30 bg-blue-500/5 p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                        <Sparkles size={20} className="text-blue-400" />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-semibold text-primary text-sm">Can&apos;t find what you need?</h4>
                        <p className="text-xs text-muted">Use AI to generate a custom flow from a plain-English description.</p>
                    </div>
                    <button
                        onClick={() => router.push('/automations/create?ai=1')}
                        className="btn btn-primary text-sm flex items-center gap-2 shrink-0"
                    >
                        <Sparkles size={14} />
                        AI Generate
                    </button>
                </div>

                {/* Grid */}
                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="card animate-pulse h-52 bg-elevated" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="card py-16 flex flex-col items-center gap-3">
                        <Users size={36} className="text-muted" />
                        <p className="text-muted text-sm">No templates match your filter.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((t: any) => (
                            <TemplateCard
                                key={t.id}
                                template={t}
                                onInstall={handleInstall}
                                installing={installingId === t.id}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
