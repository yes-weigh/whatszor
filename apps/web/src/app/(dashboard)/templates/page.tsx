import { getApiUrl } from "@/lib/api";
'use client';

import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    Zap, LayoutTemplate, Plus, FileEdit, Trash2, Globe, Clock, Layers, 
    Search, Sparkles, ImageIcon, Video, FileText, ArrowUpRight, Phone 
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QuickRepliesTab } from './components/QuickRepliesTab';

export default function TemplatesPage() {
    const qc = useQueryClient();
    const [activeTab, setActiveTab] = useState<'whatsapp' | 'quick-replies'>('whatsapp');
    const [search, setSearch] = useState('');

    const { data: templatesData, isLoading } = useQuery({
        queryKey: ['templates'],
        queryFn: () => api.get('/templates').then(r => r.data?.templates ?? []),
    });

    const { data: mediaList = [] } = useQuery({
        queryKey: ['media'],
        queryFn: () => api.get('/media-gallery').then(r => r.data?.media || []),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/templates/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
    });

    const templates: any[] = (templatesData ?? []).filter((t: any) =>
        !search || t.name?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-base">
            {/* ── Page Header ── */}
            <div className="shrink-0 px-8 pt-7 pb-5 border-b border-theme bg-surface">
                <div className="flex items-start justify-between gap-6 max-w-7xl mx-auto">
                    <div>
                        <h1 className="text-xl font-bold text-primary tracking-tight leading-tight">Template Studio</h1>
                        <p className="text-[13px] text-muted mt-1">Build and manage high-converting WhatsApp message templates</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {/* Search */}
                        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-elevated border border-theme focus-within:border-strong transition-colors w-52">
                            <Search size={13} className="text-muted shrink-0" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search templates…"
                                className="bg-transparent text-[13px] outline-none flex-1 text-primary placeholder:text-muted"
                            />
                        </div>
                        <Link
                            href="/templates/builder"
                            className="interactive-press flex items-center gap-2 px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-black text-[13px] font-semibold transition-colors shadow-sm"
                        >
                            <Plus size={15} /> Create Template
                        </Link>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-0 mt-5 max-w-7xl mx-auto">
                    <button
                        onClick={() => setActiveTab('whatsapp')}
                        className={`pb-3 pr-6 flex items-center gap-2 text-[13px] font-medium border-b-2 transition-colors ${activeTab === 'whatsapp' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-secondary'}`}
                    >
                        <LayoutTemplate size={14} /> WhatsApp Templates
                    </button>
                    <button
                        onClick={() => setActiveTab('quick-replies')}
                        className={`pb-3 px-6 flex items-center gap-2 text-[13px] font-medium border-b-2 transition-colors ${activeTab === 'quick-replies' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-secondary'}`}
                    >
                        <Zap size={14} /> Quick Replies
                    </button>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-8 py-7">
                <div className="max-w-7xl mx-auto">
                    {activeTab === 'whatsapp' ? (
                        <>
                            {/* Loading skeleton */}
                            {isLoading && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="animate-pulse rounded-xl border border-theme overflow-hidden bg-elevated">
                                            <div className="p-5 flex flex-col gap-3">
                                                <div className="h-4 bg-hover rounded w-2/3" />
                                                <div className="h-3 bg-hover rounded w-1/3" />
                                                <div className="h-[200px] bg-hover rounded-lg mt-2" />
                                                <div className="flex gap-2 mt-1">
                                                    <div className="h-5 w-20 bg-hover rounded" />
                                                    <div className="h-5 w-16 bg-hover rounded" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Empty state */}
                            {!isLoading && templates.length === 0 && (
                                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center border border-theme relative bg-elevated">
                                        <LayoutTemplate size={28} className="text-muted" />
                                        <Sparkles size={12} className="text-accent absolute -top-1.5 -right-1.5" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-primary tracking-tight">
                                            {search ? `No templates match "${search}"` : 'No templates yet'}
                                        </h2>
                                        <p className="text-[13px] text-muted mt-1.5 max-w-sm">
                                            {search ? 'Try a different search term.' : 'Design your first WhatsApp message template, enriched with media and interactive buttons.'}
                                        </p>
                                    </div>
                                    {!search && (
                                        <Link href="/templates/builder" className="interactive-press mt-2 flex items-center gap-2 px-5 py-2.5 rounded-md bg-accent hover:bg-accent-hover text-black font-semibold text-[13px] transition-colors">
                                            <Plus size={15} /> Create First Template
                                        </Link>
                                    )}
                                </div>
                            )}

                            {/* Template grid */}
                            {!isLoading && templates.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {templates.map((t: any) => {
                                        const latestVersion = t.versions?.[0];
                                        const versionNum = latestVersion?.version || 1;
                                        const selectedMedia = latestVersion?.headerMediaId
                                            ? mediaList.find((m: any) => m.id === latestVersion.headerMediaId)
                                            : null;
                                        const apiBase = getApiUrl();
                                        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
                                        const mediaUrl = selectedMedia ? `${apiBase}/media-gallery/${selectedMedia.id}/file?token=${token}` : null;

                                        return (
                                            <div
                                                key={t.id}
                                                className="group relative flex flex-col rounded-xl border border-[rgba(255,255,255,0.06)] overflow-hidden transition-all duration-[120ms] hover:border-[rgba(255,255,255,0.12)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.4)] bg-elevated"
                                            >
                                                {/* Card Header */}
                                                <div className="px-5 pt-5 pb-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-semibold text-[15px] text-primary truncate">{t.name}</h3>
                                                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted font-medium">
                                                                <span className="flex items-center gap-1"><Globe size={10} /> {t.language?.toUpperCase() || 'EN'}</span>
                                                                <span className="flex items-center gap-1"><Layers size={10} /> v{versionNum}</span>
                                                                <span className="flex items-center gap-1"><Clock size={10} /> {new Date(t.updatedAt).toLocaleDateString()}</span>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Hover actions */}
                                                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms] shrink-0">
                                                            <Link
                                                                href={`/templates/builder?id=${t.id}`}
                                                                title="Edit"
                                                                className="interactive-press w-7 h-7 rounded-md border border-theme flex items-center justify-center text-muted hover:text-primary hover:bg-hover transition-colors"
                                                            >
                                                                <FileEdit size={13} />
                                                            </Link>
                                                            <button
                                                                title="Delete"
                                                                onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(t.id); }}
                                                                className="interactive-press w-7 h-7 rounded-md border border-[rgba(239,68,68,0.2)] flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* WhatsApp Preview — static thumbnail if captured, live render otherwise */}
                                                <div className="mx-5 mb-5 rounded-lg overflow-hidden border border-[rgba(255,255,255,0.06)] relative">
                                                    {t.previewImageUrl ? (
                                                        /* ── Cached thumbnail ── */
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={`${t.previewImageUrl}?token=${token}`}
                                                            alt={`${t.name} preview`}
                                                            className="w-full object-cover min-h-[200px]"
                                                        />
                                                    ) : (
                                                        /* ── Live render fallback ── */
                                                        <div className="bg-[#0B1418] p-3 relative min-h-[200px]">
                                                            {/* Subtle WA wallpaper texture */}
                                                            <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle,#fff_1px,transparent_1px)] bg-[size:20px_20px]" />
                                                            
                                                            {/* Bubble */}
                                                            <div className="relative max-w-[88%]">
                                                                <div className="bg-[#1F2C34] rounded-[4px_12px_12px_12px] overflow-hidden shadow-sm">
                                                                    {/* Media */}
                                                                    {selectedMedia && mediaUrl && (
                                                                        <div>
                                                                            {selectedMedia.type === 'video' ? (
                                                                                <div className="w-full h-28 bg-black/50 overflow-hidden relative flex items-center justify-center">
                                                                                    <video src={mediaUrl} preload="metadata" className="w-full h-full object-cover opacity-70" />
                                                                                    <div className="absolute w-8 h-8 bg-black/60 rounded-full flex items-center justify-center">
                                                                                        <Video size={14} className="text-white" />
                                                                                    </div>
                                                                                </div>
                                                                            ) : selectedMedia.type === 'document' ? (
                                                                                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
                                                                                    <div className="w-8 h-9 bg-red-500/20 border border-red-500/20 rounded flex items-center justify-center shrink-0">
                                                                                        <FileText size={14} className="text-red-400" />
                                                                                    </div>
                                                                                    <span className="text-[11px] text-white/70 truncate">{selectedMedia.name || 'Document'}</span>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="w-full h-28 bg-black/30 overflow-hidden">
                                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                                    <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {/* No media, has mediaId placeholder */}
                                                                    {!selectedMedia && latestVersion?.headerMediaId && (
                                                                        <div className="w-full h-24 flex items-center justify-center border-b border-white/5 bg-[rgba(255,255,255,0.03)]">
                                                                            <ImageIcon size={20} className="text-white/20" />
                                                                        </div>
                                                                    )}

                                                                    {/* Text body */}
                                                                    <div className="px-3 py-2.5">
                                                                        <p className="text-[12px] text-white/85 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                                                                            {latestVersion?.messageText || <span className="italic text-white/30">No message body</span>}
                                                                        </p>
                                                                        {latestVersion?.footerText && (
                                                                            <p className="text-[10px] text-white/35 mt-1.5 line-clamp-1">{latestVersion.footerText}</p>
                                                                        )}
                                                                        {/* Timestamp */}
                                                                        <div className="flex justify-end mt-1.5">
                                                                            <span className="text-[9px] text-white/30">12:00 ✓✓</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Buttons below bubble */}
                                                                {latestVersion?.buttons?.length > 0 && (
                                                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                                                        {latestVersion.buttons.slice(0, 2).map((b: any, i: number) => (
                                                                            <div key={i} className="bg-[#1F2C34] rounded-[12px] py-1.5 px-3 text-center text-[11px] text-[#00D87C] font-medium flex items-center justify-center gap-1 shadow-sm">
                                                                                {b.type === 'url' ? <ArrowUpRight size={10} /> : b.type === 'call' ? <Phone size={10} /> : null}
                                                                                {b.label || 'Action'}
                                                                            </div>
                                                                        ))}
                                                                        {latestVersion.buttons.length > 2 && (
                                                                            <div className="bg-[#1F2C34] rounded-[12px] py-1.5 px-3 text-center text-[11px] text-[#00D87C] font-medium shadow-sm">
                                                                                +{latestVersion.buttons.length - 2} more
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Bottom fade */}
                                                            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0B1418] to-transparent pointer-events-none" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Footer */}
                                                <div className="px-5 pb-4 pt-1">
                                                    <span className="text-[11px] text-muted flex items-center gap-1">
                                                        <Clock size={10} /> {new Date(t.updatedAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        <QuickRepliesTab />
                    )}
                </div>
            </div>
        </div>
    );
}
