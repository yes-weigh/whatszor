'use client';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
    Zap, Plus, Trash2, ToggleLeft, ToggleRight,
    Image as ImageIcon, Clock, TrendingUp,
    MessageSquare, X, Check, Loader2, ChevronDown
} from 'lucide-react';

interface Media {
    id: string;
    name: string;
    url: string;
    type: string;
}

interface KeywordAutomation {
    id: string;
    keyword: string;
    matchType: 'contains' | 'exact';
    replyText: string;
    mediaId: string | null;
    media: Media | null;
    intent: string | null;
    isActive: boolean;
    cooldownSec: number;
    createdAt: string;
}

interface StatsData {
    triggerCount: number;
    lastTriggeredAt: string | null;
}

// ── Create / Edit Modal ──────────────────────────────────────────────────────

function AutomationModal({
    onClose,
    onSuccess,
}: {
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [keyword, setKeyword] = useState('');
    const [matchType, setMatchType] = useState<'contains' | 'exact'>('contains');
    const [replyText, setReplyText] = useState('');
    const [intent, setIntent] = useState('');
    const [cooldownSec, setCooldownSec] = useState(30);
    const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
    const [showMediaPicker, setShowMediaPicker] = useState(false);

    const qc = useQueryClient();

    const { data: mediaData } = useQuery({
        queryKey: ['media-gallery'],
        queryFn: () => api.get('/media-gallery').then(r => r.data ?? []),
    });
    const mediaList: Media[] = mediaData ?? [];

    const createMutation = useMutation({
        mutationFn: (data: any) => api.post('/keyword-automations', data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['keyword-automations'] });
            onSuccess();
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!keyword.trim() || !replyText.trim()) return;
        createMutation.mutate({
            keyword: keyword.trim().toLowerCase(),
            matchType,
            replyText: replyText.trim(),
            mediaId: selectedMedia?.id ?? null,
            intent: intent.trim() || null,
            cooldownSec,
        });
    };

    const intentOptions = ['pricing', 'support', 'demo', 'order', 'complaint', 'availability', 'discount'];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div
                className="w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl bg-[rgba(10,10,10,0.98)]"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/8">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                            <Zap size={18} className="text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-white">New Keyword Automation</h2>
                            <p className="text-xs text-zinc-500">Auto-reply when message matches keyword</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        title="Close"
                        aria-label="Close modal"
                        className="text-zinc-500 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Keyword + Match Type */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-2">Trigger Keyword</label>
                        <div className="flex gap-2">
                            <input
                                id="kw-keyword"
                                type="text"
                                placeholder="e.g. price, demo, buy"
                                value={keyword}
                                onChange={e => setKeyword(e.target.value)}
                                className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60"
                                required
                            />
                            <select
                                id="kw-match-type"
                                title="Match type"
                                aria-label="Match type"
                                value={matchType}
                                onChange={e => setMatchType(e.target.value as any)}
                                className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/60"
                            >
                                <option value="contains">Contains</option>
                                <option value="exact">Exact</option>
                            </select>
                        </div>
                        <p className="text-xs text-zinc-600 mt-1.5">
                            {matchType === 'contains'
                                ? '→ Triggers when message contains this keyword anywhere'
                                : '→ Triggers only on exact match of the full message'}
                        </p>
                    </div>

                    {/* Reply Text */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-2">Auto Reply Text</label>
                        <textarea
                            id="kw-reply-text"
                            rows={4}
                            placeholder={"Hi! Our pricing starts at ₹999/month. Here's what's included:\n• Feature A\n• Feature B\nReply 'DEMO' to see it live! 🚀"}
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 resize-none"
                            required
                        />
                    </div>

                    {/* Media Attachment */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-2">
                            Attach Media <span className="text-zinc-600">(optional)</span>
                        </label>
                        {selectedMedia ? (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                                <div className="w-8 h-8 rounded-md bg-emerald-500/20 flex items-center justify-center">
                                    <ImageIcon size={14} className="text-emerald-400" />
                                </div>
                                <span className="text-sm text-emerald-300 flex-1 truncate">{selectedMedia.name}</span>
                                <button
                                    type="button"
                                    title="Remove media"
                                    aria-label="Remove selected media"
                                    onClick={() => setSelectedMedia(null)}
                                    className="text-zinc-500 hover:text-red-400 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                id="kw-pick-media"
                                onClick={() => setShowMediaPicker(!showMediaPicker)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 border-dashed text-sm text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-colors"
                            >
                                <ImageIcon size={14} />
                                Pick from Media Gallery
                                <ChevronDown size={12} className="ml-auto" />
                            </button>
                        )}

                        {showMediaPicker && (
                            <div className="mt-2 rounded-lg border border-white/10 bg-black/80 max-h-48 overflow-y-auto">
                                {mediaList.length === 0 ? (
                                    <p className="text-xs text-zinc-500 p-4 text-center">No media in gallery</p>
                                ) : (
                                    mediaList.map((m: Media) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => { setSelectedMedia(m); setShowMediaPicker(false); }}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors text-left"
                                        >
                                            <ImageIcon size={12} className="text-zinc-500 shrink-0" />
                                            <span className="truncate">{m.name}</span>
                                            <span className="text-xs text-zinc-600 ml-auto shrink-0">{m.type}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Intent Tag + Cooldown */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-2">Intent Tag</label>
                            <select
                                id="kw-intent"
                                title="Intent tag"
                                aria-label="Intent tag"
                                value={intent}
                                onChange={e => setIntent(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/60"
                            >
                                <option value="">None</option>
                                {intentOptions.map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-2">Cooldown (sec)</label>
                            <input
                                id="kw-cooldown"
                                title="Cooldown seconds"
                                aria-label="Cooldown in seconds"
                                type="number"
                                min={5}
                                max={3600}
                                value={cooldownSec}
                                onChange={e => setCooldownSec(Number(e.target.value))}
                                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500/60"
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="rounded-xl border border-white/8 p-4 bg-white/[0.02]">
                        <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Preview</p>
                        <div className="flex items-start gap-2">
                            <div className="text-xs text-zinc-600 mt-0.5">When:</div>
                            <div>
                                <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono">
                                    {keyword || 'keyword'}
                                </span>
                                <span className="text-xs text-zinc-600 mx-1.5">
                                    ({matchType === 'contains' ? 'appears in' : 'exactly equals'} message)
                                </span>
                            </div>
                        </div>
                        <div className="flex items-start gap-2 mt-1.5">
                            <div className="text-xs text-zinc-600 mt-0.5">Sends:</div>
                            <div className="text-xs text-zinc-400 flex-1 truncate">
                                {replyText ? `"${replyText.substring(0, 60)}${replyText.length > 60 ? '...' : ''}"` : 'reply text'}
                                {selectedMedia && (
                                    <span className="ml-1 text-emerald-400">+ {selectedMedia.name}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {createMutation.isError && (
                        <p className="text-xs text-red-400">Failed to create automation. Please try again.</p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 text-sm text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            id="kw-submit"
                            disabled={createMutation.isPending || !keyword.trim() || !replyText.trim()}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                            Create Automation
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Stats Badge ──────────────────────────────────────────────────────────────

function StatsBadge({ automationId }: { automationId: string }) {
    const { data } = useQuery<StatsData>({
        queryKey: ['kw-stats', automationId],
        queryFn: () => api.get(`/keyword-automations/${automationId}/stats`).then(r => r.data),
        staleTime: 30_000,
    });

    if (!data) return null;

    return (
        <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <TrendingUp size={10} />
            {data.triggerCount} triggers
        </div>
    );
}

// ── Main Tab Component ────────────────────────────────────────────────────────

export function KeywordAutomationsTab() {
    const qc = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const { data, isLoading } = useQuery<KeywordAutomation[]>({
        queryKey: ['keyword-automations'],
        queryFn: () => api.get('/keyword-automations').then(r => r.data ?? []),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
            api.patch(`/keyword-automations/${id}`, { isActive }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['keyword-automations'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/keyword-automations/${id}`),
        onSuccess: () => {
            setConfirmDelete(null);
            qc.invalidateQueries({ queryKey: ['keyword-automations'] });
        },
    });

    const automations = data ?? [];

    const matchTypeColor = {
        contains: 'bg-blue-500/15 text-blue-300',
        exact: 'bg-purple-500/15 text-purple-300',
    };

    return (
        <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-white">Keyword Automations</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Instant replies when leads send specific keywords — zero delay, 24/7
                    </p>
                </div>
                <button
                    id="kw-new-btn"
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-colors"
                >
                    <Plus size={14} />
                    New Automation
                </button>
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Zap size={14} className="text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-emerald-300">How it works</p>
                        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                            Lead sends "PRICE" → System instantly replies with your pricing card + image → AI follows up → You close.
                            <br />
                            <span className="text-emerald-400">This is your automated sales funnel inside WhatsApp.</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-emerald-500" />
                </div>
            )}

            {/* Empty state */}
            {!isLoading && automations.length === 0 && (
                <div className="rounded-xl border border-white/8 p-10 text-center bg-white/[0.02]">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                        <Zap size={22} className="text-emerald-400" />
                    </div>
                    <p className="text-sm font-medium text-white mb-1">No keyword automations yet</p>
                    <p className="text-xs text-zinc-500 mb-4">
                        Create your first one. When a lead texts "price", they'll get your reply instantly.
                    </p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-colors"
                    >
                        Create First Automation
                    </button>
                </div>
            )}

            {/* List */}
            <div className="space-y-3">
                {automations.map((auto) => (
                    <div
                        key={auto.id}
                        className={`rounded-xl border p-4 transition-all duration-200 ${auto.isActive
                            ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                            : 'border-white/8 bg-white/[0.02]'
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            {/* Icon */}
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${auto.isActive ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
                                <Zap size={16} className={auto.isActive ? 'text-emerald-400' : 'text-zinc-600'} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                {/* Keyword + match type */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <code className="text-sm font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded-md">
                                        {auto.keyword}
                                    </code>
                                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${matchTypeColor[auto.matchType] ?? 'bg-zinc-700 text-zinc-300'}`}>
                                        {auto.matchType}
                                    </span>
                                    {auto.intent && (
                                        <span className="text-[10px] bg-orange-500/15 text-orange-300 px-2 py-0.5 rounded-full">
                                            {auto.intent}
                                        </span>
                                    )}
                                    <StatsBadge automationId={auto.id} />
                                </div>

                                {/* Reply preview */}
                                <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                                    <MessageSquare size={10} className="inline mr-1 text-zinc-600" />
                                    {auto.replyText}
                                </p>

                                {/* Meta */}
                                <div className="flex items-center gap-4 mt-2">
                                    {auto.media && (
                                        <div className="flex items-center gap-1 text-xs text-zinc-500">
                                            <ImageIcon size={10} />
                                            {auto.media.name}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 text-xs text-zinc-600">
                                        <Clock size={10} />
                                        {auto.cooldownSec}s cooldown
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    title={auto.isActive ? 'Disable' : 'Enable'}
                                    onClick={() => toggleMutation.mutate({ id: auto.id, isActive: !auto.isActive })}
                                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    {auto.isActive
                                        ? <ToggleRight size={18} className="text-emerald-400" />
                                        : <ToggleLeft size={18} className="text-zinc-600" />}
                                </button>
                                {confirmDelete === auto.id ? (
                                    <div className="flex items-center gap-1">
                                        <button
                                            title="Confirm delete"
                                            aria-label="Confirm delete automation"
                                            onClick={() => deleteMutation.mutate(auto.id)}
                                            className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors"
                                        >
                                            <Check size={14} className="text-red-400" />
                                        </button>
                                        <button
                                            title="Cancel delete"
                                            aria-label="Cancel delete"
                                            onClick={() => setConfirmDelete(null)}
                                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                        >
                                            <X size={14} className="text-zinc-500" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        title="Delete"
                                        onClick={() => setConfirmDelete(auto.id)}
                                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        <Trash2 size={15} className="text-zinc-600 hover:text-red-400 transition-colors" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <AutomationModal
                    onClose={() => setShowModal(false)}
                    onSuccess={() => setShowModal(false)}
                />
            )}
        </div>
    );
}
