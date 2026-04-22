import { getApiUrl } from "@/lib/api";
'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { X, Search, Image as ImageIcon, Video, FileText, Loader2, Check } from 'lucide-react';

interface MediaItem {
    id: string;
    name: string;
    type: string;
    mimeType?: string | null;
    url?: string;
}

interface MediaPickerModalProps {
    onSelect: (media: MediaItem) => void;
    onClose: () => void;
    selectedId?: string | null;
}

const API_BASE = getApiUrl();

function getToken(): string {
    return typeof window !== 'undefined' ? (localStorage.getItem('accessToken') || '') : '';
}

function getMediaUrl(id: string): string {
    return `${API_BASE}/media-gallery/${id}/file?token=${getToken()}`;
}

function MediaTypeIcon({ type }: { type: string }) {
    if (type === 'image') return <ImageIcon size={16} />;
    if (type === 'video') return <Video size={16} />;
    return <FileText size={16} />;
}

// This component is always rendered from another 'use client' component, so function props are safe.
// eslint-disable-next-line react/prop-types
export function MediaPickerModal({ onSelect, onClose, selectedId }: MediaPickerModalProps) {
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('');

    const { data, isPending } = useQuery({
        queryKey: ['media-gallery-picker'],
        queryFn: async () => {
            const res = await api.get('/media-gallery');
            return (res.data?.media || []) as MediaItem[];
        },
    });

    const filtered = (data || []).filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
        const matchesType = !typeFilter || m.type === typeFilter;
        return matchesSearch && matchesType;
    });

    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="bg-elevated border border-theme rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-theme">
                    <h2 className="text-base font-semibold text-primary">Select Media</h2>
                    <button
                        onClick={onClose}
                        title="Close"
                        aria-label="Close"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Filters */}
                <div className="px-5 py-3 border-b border-theme flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search media..."
                            className="w-full bg-surface border border-theme rounded-lg py-2 pl-8 pr-4 text-sm focus:border-accent text-primary outline-none transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        {(['', 'image', 'video', 'document'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setTypeFilter(t)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    typeFilter === t
                                        ? 'bg-accent text-white'
                                        : 'bg-surface text-muted hover:text-primary border border-theme'
                                }`}
                            >
                                {t === '' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isPending && (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 size={24} className="animate-spin text-muted" />
                        </div>
                    )}

                    {!isPending && filtered.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-40 text-center">
                            <ImageIcon size={32} className="text-muted mb-2" />
                            <p className="text-sm text-muted">No media found</p>
                        </div>
                    )}

                    {!isPending && filtered.length > 0 && (
                        <div className="grid grid-cols-4 gap-3">
                            {filtered.map(media => {
                                const isSelected = selectedId === media.id;
                                return (
                                    <button
                                        key={media.id}
                                        onClick={() => onSelect(media)}
                                        className={`relative group rounded-xl border-2 overflow-hidden transition-all focus:outline-none ${
                                            isSelected
                                                ? 'border-accent shadow-lg shadow-accent/20'
                                                : 'border-theme hover:border-accent/50'
                                        }`}
                                    >
                                        {/* Thumbnail */}
                                        {media.type === 'image' ? (
                                            <div className="aspect-square bg-surface flex items-center justify-center overflow-hidden">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={getMediaUrl(media.id)}
                                                    alt={media.name}
                                                    className="w-full h-full object-cover"
                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            </div>
                                        ) : (
                                            <div className="aspect-square bg-surface flex items-center justify-center">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                                    media.type === 'video' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                    <MediaTypeIcon type={media.type} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Name overlay */}
                                        <div className="px-2 py-1.5 bg-elevated">
                                            <p className="text-[10px] text-secondary truncate text-left">{media.name}</p>
                                        </div>

                                        {/* Selected checkmark */}
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center shadow">
                                                <Check size={12} className="text-white" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-theme flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-primary transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
