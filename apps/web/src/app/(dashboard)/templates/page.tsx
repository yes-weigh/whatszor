'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, LayoutTemplate, Plus, FileEdit, Trash2, Globe, Clock, Layers } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QuickRepliesTab } from './components/QuickRepliesTab';

export default function TemplatesPage() {
    const qc = useQueryClient();
    const [activeTab, setActiveTab] = useState<'whatsapp' | 'quick-replies'>('whatsapp');

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

    const templates: any[] = templatesData ?? [];

    return (
        <div className="flex flex-col h-full bg-surface">
            <Header title="Template Studio" subtitle="Build and manage highly converting WhatsApp message templates" />
            
            <div className="px-6 flex gap-2 border-b border-theme bg-surface pt-4">
                <button 
                    onClick={() => setActiveTab('whatsapp')}
                    className={`pb-3 px-4 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'whatsapp' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-secondary'}`}
                >
                    <LayoutTemplate size={16} /> WhatsApp Templates
                </button>
                <button 
                    onClick={() => setActiveTab('quick-replies')}
                    className={`pb-3 px-4 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'quick-replies' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-secondary'}`}
                >
                    <Zap size={16} /> Quick Replies
                </button>
            </div>

            <div className="p-6 flex-1 flex flex-col max-w-7xl mx-auto w-full">
                {activeTab === 'whatsapp' ? (
                <div className="flex flex-col gap-6 w-full">
                
                {/* Action Bar */}
                <div className="flex justify-end items-center gap-4">
                    <Link href="/templates/builder" className="btn btn-primary flex items-center gap-2">
                        <Plus size={16} /> Create Template
                    </Link>
                </div>

                {/* Listing */}
                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <div className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
                    </div>
                ) : templates.length === 0 ? (
                    <div className="card flex flex-col items-center gap-3 py-16 text-center border-dashed bg-transparent border-2 border-theme">
                        <div className="w-16 h-16 rounded-full bg-elevated border border-theme flex items-center justify-center text-muted mb-2">
                            <LayoutTemplate size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-primary">No templates yet.</h3>
                        <p className="text-sm text-muted max-w-sm mb-4">Design your first WhatsApp message template and enrich it with media and interactive buttons.</p>
                        <Link href="/templates/builder" className="btn btn-primary">Create First Template</Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {templates.map((t: any) => {
                            const latestVersion = t.versions?.[0]; // backend only serves take: 1 for lists
                            const versionNum = latestVersion?.version || 1;
                            const selectedMedia = latestVersion?.headerMediaId ? mediaList.find((m: any) => m.id === latestVersion.headerMediaId) : null;

                            return (
                                <div key={t.id} className="card relative group flex flex-col gap-4 overflow-hidden border-theme hover:border-accent hover:shadow-md transition-all">
                                    <div className="flex items-start justify-between">
                                        <div className="pr-8">
                                            <h3 className="font-semibold text-lg text-primary">{t.name}</h3>
                                            <div className="flex items-center gap-3 mt-2 text-xs text-muted font-medium">
                                                <span className="flex items-center gap-1"><Globe size={12}/> {t.language || 'EN'}</span>
                                                <span className="flex items-center gap-1"><Layers size={12}/> v{versionNum}</span>
                                                <span className="flex items-center gap-1"><Clock size={12}/> {new Date(t.updatedAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Preview Snippet */}
                                    <div className="bg-[#EFEAE2] rounded-lg p-3 border border-theme text-sm relative overflow-hidden flex flex-col h-[260px]">
                                        <div className="flex-1 overflow-hidden relative">
                                            <div className="bg-white rounded-lg rounded-tl-none p-1 shadow-sm max-w-[90%] relative break-words">
                                                {selectedMedia && (() => {
                                                    const mediaUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/media-gallery/${selectedMedia.id}/file?token=${typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''}`;
                                                    if (selectedMedia.type === 'video') {
                                                        return (
                                                            <div className="w-full h-24 bg-black rounded mb-1 overflow-hidden relative">
                                                                <video src={mediaUrl} preload="metadata" className="w-full h-full object-cover" />
                                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                                    <div className="w-8 h-8 bg-black/50 rounded-full flex items-center justify-center">
                                                                        <span className="text-white text-sm leading-none ml-0.5">▶</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    } else if (selectedMedia.type === 'document') {
                                                        return (
                                                            <div className="w-full rounded mb-1 bg-gray-50 border border-gray-200 flex items-center gap-2 p-2">
                                                                <div className="w-8 h-10 bg-red-100 rounded flex items-center justify-center shrink-0 text-lg">📄</div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[10px] font-semibold text-gray-700 truncate">{selectedMedia.name || 'Document'}</p>
                                                                    <p className="text-[8px] text-gray-400 mt-0.5 uppercase">{selectedMedia.mimeType || 'PDF'}</p>
                                                                </div>
                                                            </div>
                                                        );
                                                    } else {
                                                        return (
                                                            <div className="w-full h-24 bg-gray-100 rounded mb-1 overflow-hidden">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                                                            </div>
                                                        );
                                                    }
                                                })()}
                                                {!selectedMedia && latestVersion?.headerMediaId && (
                                                    <div className="w-full h-24 bg-gray-100 rounded mb-1 flex items-center justify-center text-gray-400 border border-gray-200">
                                                        <span className="text-xl">🖼️</span>
                                                    </div>
                                                )}
                                                <div className="px-2 py-1 text-xs text-gray-800 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                                                    {latestVersion?.messageText || <span className="text-gray-400 italic">Empty Template</span>}
                                                </div>
                                                {latestVersion?.footerText && (
                                                    <div className="px-2 pb-1 text-[10px] text-gray-400 mt-1 line-clamp-1">
                                                        {latestVersion.footerText}
                                                    </div>
                                                )}
                                            </div>
                                            {latestVersion?.buttons?.length > 0 && (
                                                <div className="flex flex-col gap-1 mt-1 max-w-[90%]">
                                                    {latestVersion.buttons.slice(0, 2).map((b: any, i: number) => (
                                                        <div key={i} className="bg-white rounded-lg shadow-sm py-1.5 px-3 text-center text-[#00A884] text-xs font-medium border-t-0 flex items-center justify-center gap-1 truncate">
                                                            {b.type === 'url' ? '↗' : b.type === 'call' ? '📞' : ''} {b.label || 'Action'}
                                                        </div>
                                                    ))}
                                                    {latestVersion.buttons.length > 2 && (
                                                        <div className="bg-white rounded-lg shadow-sm py-1.5 px-3 text-center text-[#00A884] text-xs font-medium border-t-0 flex items-center justify-center gap-1 truncate">
                                                            +{latestVersion.buttons.length - 2} more
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-[#EFEAE2] to-transparent pointer-events-none"></div>
                                    </div>

                                    {/* Counters */}
                                    <div className="flex gap-2">
                                        {latestVersion?.headerMediaId && (
                                            <span className="badge badge-blue text-[10px] uppercase font-bold tracking-wider">Media Attached</span>
                                        )}
                                        {latestVersion?.buttons?.length > 0 && (
                                            <span className="badge badge-gray text-[10px] uppercase font-bold tracking-wider">{latestVersion.buttons.length} Buttons</span>
                                        )}
                                    </div>

                                    {/* Hover Actions */}
                                    <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                                        <Link 
                                            href={`/templates/builder?id=${t.id}`}
                                            className="w-8 h-8 rounded-full bg-surface border border-theme text-primary flex items-center justify-center hover:bg-accent hover:text-white transition-colors"
                                            title="Edit Template"
                                        >
                                            <FileEdit size={14} />
                                        </Link>
                                        <button 
                                            title="Delete Template"
                                            onClick={() => { if(confirm('Are you sure you want to delete this root template entirely?')) deleteMutation.mutate(t.id); }}
                                            className="w-8 h-8 rounded-full bg-surface border border-theme text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                </div>
                ) : (
                    <div className="w-full">
                        <QuickRepliesTab />
                    </div>
                )}
            </div>
        </div>
    );
}
