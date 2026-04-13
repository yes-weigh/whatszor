'use client';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
    Zap, Plus, Trash2, ToggleLeft, ToggleRight,
    Image as ImageIcon, Clock, TrendingUp,
    MessageSquare, X, Check, Loader2, ChevronDown, Pencil,
    Layout, ArrowUpDown, Regex, Brain, HelpCircle
} from 'lucide-react';

interface Media {
    id: string;
    name: string;
    url: string;
    type: string;
}

interface Template {
    id: string;
    name: string;
}

interface KeywordAutomation {
    id: string;
    keyword: string;
    matchType: 'EXACT' | 'CONTAINS' | 'REGEX' | 'AI_INTENT';
    replyText: string | null;
    mediaId: string | null;
    media: Media | null;
    templateId: string | null;
    template: Template | null;
    intent: string | null;
    isActive: boolean;
    priority: number;
    cooldownSec: number;
    createdAt: string;
}

type ReplyMode = 'standard' | 'template';

// ── Create / Edit Modal ──────────────────────────────────────────────────────

function AutomationModal({
    onClose,
    onSuccess,
    editRule,
}: {
    onClose: () => void;
    onSuccess: () => void;
    editRule?: KeywordAutomation | null;
}) {
    const isEdit = !!editRule;

    // Determine initial reply mode 
    const initialMode: ReplyMode = editRule?.templateId ? 'template' : 'standard';

    const [keyword, setKeyword] = useState(editRule?.keyword || '');
    const [matchType, setMatchType] = useState<KeywordAutomation['matchType']>(editRule?.matchType || 'CONTAINS');
    const [replyMode, setReplyMode] = useState<ReplyMode>(initialMode);
    const [replyText, setReplyText] = useState(editRule?.replyText || '');
    const [intent, setIntent] = useState(editRule?.intent || '');
    const [priority, setPriority] = useState(editRule?.priority ?? 0);
    const [cooldownSec, setCooldownSec] = useState(editRule?.cooldownSec || 30);
    const [selectedMedia, setSelectedMedia] = useState<Media | null>(editRule?.media || null);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(editRule?.template || null);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [showMatchInfo, setShowMatchInfo] = useState(false);

    const qc = useQueryClient();

    const { data: mediaData } = useQuery({
        queryKey: ['media-gallery'],
        queryFn: () => api.get('/media-gallery').then(r => {
            if (Array.isArray(r.data)) return r.data;
            return r.data?.media || [];
        }),
    });

    const { data: templatesData } = useQuery({
        queryKey: ['templates'],
        queryFn: () => api.get('/templates').then(r => {
            if (Array.isArray(r.data)) return r.data;
            return r.data?.templates || [];
        }),
        enabled: replyMode === 'template',
    });

    const mediaList: Media[] = Array.isArray(mediaData) ? mediaData : [];
    const templateList: Template[] = Array.isArray(templatesData) ? templatesData : [];

    const createMutation = useMutation({
        mutationFn: (data: any) => api.post('/keyword-automations', data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['keyword-automations'] }); onSuccess(); },
    });

    const updateMutation = useMutation({
        mutationFn: (data: any) => api.patch(`/keyword-automations/${editRule!.id}`, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['keyword-automations'] }); onSuccess(); },
    });

    const isPending = createMutation.isPending || updateMutation.isPending;
    const isError = createMutation.isError || updateMutation.isError;

    const isSubmitDisabled =
        isPending ||
        !keyword.trim() ||
        (replyMode === 'standard' && !replyText.trim()) ||
        (replyMode === 'template' && !selectedTemplate);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const payload: any = {
            keyword: keyword.trim().toLowerCase(),
            matchType,
            priority,
            intent: intent.trim() || null,
            cooldownSec,
        };

        if (replyMode === 'template') {
            payload.templateId = selectedTemplate!.id;
            payload.replyText = null;
            payload.mediaId = null;
        } else {
            payload.replyText = replyText.trim();
            payload.mediaId = selectedMedia?.id ?? null;
            payload.templateId = null;
        }

        if (isEdit) {
            updateMutation.mutate(payload);
        } else {
            createMutation.mutate(payload);
        }
    };

    const intentOptions = ['pricing', 'support', 'demo', 'order', 'complaint', 'availability', 'discount'];

    const matchTypeInfo: Record<string, { label: string; desc: string; icon: React.ReactNode }> = {
        CONTAINS: { label: 'Contains', desc: 'Triggers when message contains this keyword anywhere', icon: <MessageSquare size={12} /> },
        EXACT: { label: 'Exact', desc: 'Triggers only on exact match of the full message', icon: <Check size={12} /> },
        REGEX: { label: 'Regex', desc: 'Pattern matching — use regex syntax (max 100 chars)', icon: <Regex size={12} /> },
        AI_INTENT: { label: 'AI Intent', desc: 'AI classifies message intent (falls back to contains on failure)', icon: <Brain size={12} /> },
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-theme shadow-2xl bg-surface max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-theme sticky top-0 z-10 bg-surface">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center">
                            <Zap size={18} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-primary">
                                {isEdit ? 'Edit Keyword Automation' : 'New Keyword Automation'}
                            </h2>
                            <p className="text-xs text-muted">Auto-reply when message matches keyword</p>
                        </div>
                    </div>
                    <button onClick={onClose} title="Close" aria-label="Close modal" className="text-secondary hover:text-primary transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">

                    {/* Keyword + Match Type */}
                    <div className="relative">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-medium text-secondary">Trigger Keyword</label>
                            <button 
                                type="button" 
                                onClick={() => setShowMatchInfo(!showMatchInfo)}
                                className="text-secondary hover:text-emerald-600 dark:text-emerald-400 transition-colors flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider"
                            >
                                <HelpCircle size={12} />
                                Match Types
                            </button>
                        </div>
                        
                        {/* The Info Popover */}
                        {showMatchInfo && (
                            <div className="absolute top-7 right-0 min-w-[340px] max-w-[420px] z-[60] bg-surface border border-theme rounded-xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between mb-3 border-b border-theme pb-2">
                                    <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                                        <Zap size={14} className="text-emerald-600 dark:text-emerald-400"/> Match Types Explained
                                    </h3>
                                    <button type="button" aria-label="Close" title="Close" onClick={() => setShowMatchInfo(false)} className="text-muted hover:text-primary">
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                                    <div>
                                        <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-xs font-bold mb-1">
                                            <MessageSquare size={12} /> Contains (Default)
                                        </div>
                                        <p className="text-[11px] text-muted leading-relaxed">
                                            Triggers if the keyword is found <em>anywhere</em> within the lead&apos;s message. Best for general inquiries.
                                            <br/><span className="text-muted mt-1 block">Ex: keyword <code className="bg-elevated px-1 rounded">price</code> triggers on &quot;What is the price?&quot;</span>
                                        </p>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 text-xs font-bold mb-1">
                                            <Check size={12} /> Exact
                                        </div>
                                        <p className="text-[11px] text-muted leading-relaxed">
                                            Triggers ONLY if the lead&apos;s message matches your keyword with 100% precision.
                                            <br/><span className="text-muted mt-1 block">Ex: keyword <code className="bg-elevated px-1 rounded">STOP</code> triggers on &quot;STOP&quot; but not &quot;Please stop&quot;</span>
                                        </p>
                                    </div>
                                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                                        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-bold mb-2">
                                            <Regex size={12} /> Regex Reference
                                        </div>
                                        <p className="text-[11px] text-muted leading-relaxed mb-2.5">
                                            Uses standard Regular Expression syntax for complex pattern matching. Do not include wrapping slashes (no <code className="text-secondary tracking-wider bg-elevated px-1 rounded">/</code>), just enter the raw pattern. All matches are case-insensitive by default.
                                        </p>
                                        <div className="text-[10px] text-muted space-y-2">
                                            <div className="bg-elevated p-2 rounded border border-theme">
                                                <code className="text-amber-700 dark:text-amber-300 font-mono tracking-wider">\b(buy|purchase|order)\b</code>
                                                <p className="mt-1 leading-relaxed">Matches any of those exact words, but ignores variations like &quot;buying&quot; or &quot;preorder&quot;.</p>
                                            </div>
                                            <div className="bg-elevated p-2 rounded border border-theme">
                                                <code className="text-amber-700 dark:text-amber-300 font-mono tracking-wider">{"^start.*"}</code>
                                                <p className="mt-1 leading-relaxed">Matches any message that <em>begins</em> with the word &quot;start&quot;.</p>
                                            </div>
                                            <div className="bg-elevated p-2 rounded border border-theme">
                                                <code className="text-amber-700 dark:text-amber-300 font-mono tracking-wider">{"\\d{5}"}</code>
                                                <p className="mt-1 leading-relaxed">Matches if the message contains exactly a 5-digit number (e.g., zip codes).</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 text-pink-600 dark:text-pink-400 text-xs font-bold mb-1">
                                            <Brain size={12} /> AI Intent
                                        </div>
                                        <p className="text-[11px] text-muted leading-relaxed">
                                            AI routes the message based on its <em>meaning</em>. Falls back to Contains if AI fails.
                                            <br/><span className="text-muted mt-1 block">Ex: intent <code className="bg-elevated px-1 rounded">support</code> triggers on &quot;My app is crashing!&quot;</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <input
                                id="kw-keyword"
                                type="text"
                                placeholder="e.g. price, demo, buy"
                                value={keyword}
                                onChange={e => setKeyword(e.target.value)}
                                className="flex-1 px-3 py-2.5 rounded-lg bg-elevated border border-theme text-sm text-primary placeholder:text-muted outline-none focus:border-accent/60"
                                required
                            />
                            <select
                                id="kw-match-type"
                                title="Match type"
                                aria-label="Match type"
                                value={matchType}
                                onChange={e => setMatchType(e.target.value as KeywordAutomation['matchType'])}
                                className="px-3 py-2.5 rounded-lg bg-elevated border border-theme text-sm text-secondary outline-none focus:border-accent/60"
                            >
                                {Object.entries(matchTypeInfo).map(([val, info]) => (
                                    <option key={val} value={val}>{info.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-muted">{matchTypeInfo[matchType]?.icon}</span>
                            <p className="text-xs text-muted">→ {matchTypeInfo[matchType]?.desc}</p>
                        </div>
                    </div>

                    {/* Priority */}
                    <div>
                        <label className="block text-xs font-medium text-muted mb-2 flex items-center gap-1.5">
                            <ArrowUpDown size={11} className="text-muted" />
                            Priority <span className="text-muted">(higher = runs first)</span>
                        </label>
                        <input
                            id="kw-priority"
                            type="number"
                            title="Priority"
                            aria-label="Automation priority (higher runs first)"
                            min={0}
                            max={100}
                            value={priority}
                            onChange={e => setPriority(Number(e.target.value))}
                            className="w-full px-3 py-2.5 rounded-lg bg-elevated border border-theme text-sm text-primary outline-none focus:border-accent/60"
                        />
                        <p className="text-xs text-muted mt-1">When multiple keywords match, highest priority triggers first.</p>
                    </div>

                    {/* Reply Mode Toggle */}
                    <div>
                        <label className="block text-xs font-medium text-muted mb-2">Reply Mode</label>
                        <div className="flex rounded-lg overflow-hidden border border-theme p-0.5 bg-elevated">
                            <button
                                type="button"
                                onClick={() => setReplyMode('standard')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${replyMode === 'standard'
                                    ? 'bg-emerald-500 text-black'
                                    : 'text-muted hover:text-primary'
                                    }`}
                            >
                                <MessageSquare size={12} />
                                Standard Message
                            </button>
                            <button
                                type="button"
                                onClick={() => setReplyMode('template')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${replyMode === 'template'
                                    ? 'bg-emerald-500 text-black'
                                    : 'text-muted hover:text-primary'
                                    }`}
                            >
                                <Layout size={12} />
                                Rich Template
                            </button>
                        </div>
                    </div>

                    {/* Standard Mode Fields */}
                    {replyMode === 'standard' && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-muted mb-2">Auto Reply Text</label>
                                <textarea
                                    id="kw-reply-text"
                                    rows={4}
                                    placeholder={"Hi! Our pricing starts at ₹999/month. Here's what's included:\n• Feature A\n• Feature B\nReply 'DEMO' to see it live! 🚀"}
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg bg-elevated border border-theme text-sm text-primary placeholder:text-muted outline-none focus:border-accent/60 resize-none"
                                    required={replyMode === 'standard'}
                                />
                            </div>

                            {/* Media Attachment */}
                            <div>
                                <label className="block text-xs font-medium text-muted mb-2">
                                    Attach Media <span className="text-muted">(optional)</span>
                                </label>
                                {selectedMedia ? (
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                                        <div className="w-8 h-8 rounded-md bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                                            <ImageIcon size={14} className="text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <span className="text-sm text-emerald-700 dark:text-emerald-300 flex-1 truncate">{selectedMedia.name}</span>
                                        <button type="button" title="Remove media" onClick={() => setSelectedMedia(null)} className="text-muted hover:text-red-600 dark:text-red-400 transition-colors">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        id="kw-pick-media"
                                        onClick={() => setShowMediaPicker(!showMediaPicker)}
                                        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-elevated border border-theme border-dashed text-sm text-muted hover:text-secondary hover:border-border-strong transition-colors"
                                    >
                                        <ImageIcon size={14} />
                                        Pick from Media Gallery
                                        <ChevronDown size={12} className="ml-auto" />
                                    </button>
                                )}
                                {showMediaPicker && (
                                    <div className="mt-2 rounded-lg border border-theme bg-surface max-h-48 overflow-y-auto">
                                        {mediaList.length === 0 ? (
                                            <p className="text-xs text-muted p-4 text-center">No media in gallery</p>
                                        ) : (
                                            mediaList.map((m: Media) => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onClick={() => { setSelectedMedia(m); setShowMediaPicker(false); }}
                                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary hover:bg-hover transition-colors text-left"
                                                >
                                                    <ImageIcon size={12} className="text-muted shrink-0" />
                                                    <span className="truncate">{m.name}</span>
                                                    <span className="text-xs text-zinc-600 ml-auto shrink-0">{m.type}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Template Mode Fields */}
                    {replyMode === 'template' && (
                        <div>
                            <label className="block text-xs font-medium text-muted mb-2">Select Template</label>
                            {selectedTemplate ? (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                                    <div className="w-8 h-8 rounded-md bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center">
                                        <Layout size={14} className="text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <span className="text-sm text-purple-700 dark:text-purple-300 flex-1 truncate">{selectedTemplate.name}</span>
                                    <button type="button" title="Remove template" onClick={() => setSelectedTemplate(null)} className="text-muted hover:text-red-600 dark:text-red-400 transition-colors">
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    id="kw-pick-template"
                                    onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-elevated border border-theme border-dashed text-sm text-muted hover:text-secondary hover:border-border-strong transition-colors"
                                >
                                    <Layout size={14} />
                                    Pick from Template Studio
                                    <ChevronDown size={12} className="ml-auto" />
                                </button>
                            )}
                            {showTemplatePicker && (
                                <div className="mt-2 rounded-lg border border-theme bg-surface max-h-48 overflow-y-auto">
                                    {templateList.length === 0 ? (
                                        <p className="text-xs text-muted p-4 text-center">No templates found. Create one in Template Studio.</p>
                                    ) : (
                                        templateList.map((t: Template) => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => { setSelectedTemplate(t); setShowTemplatePicker(false); }}
                                                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary hover:bg-hover transition-colors text-left"
                                            >
                                                <Layout size={12} className="text-muted shrink-0" />
                                                <span className="truncate">{t.name}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Intent Tag + Cooldown */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted mb-2">Intent Tag</label>
                            <select
                                id="kw-intent"
                                title="Intent tag"
                                aria-label="Intent tag"
                                value={intent}
                                onChange={e => setIntent(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg bg-elevated border border-theme text-sm text-secondary outline-none focus:border-accent/60"
                            >
                                <option value="">None</option>
                                {intentOptions.map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted mb-2">Cooldown (sec)</label>
                            <input
                                id="kw-cooldown"
                                title="Cooldown seconds"
                                aria-label="Cooldown in seconds"
                                type="number"
                                min={5}
                                max={3600}
                                value={cooldownSec}
                                onChange={e => setCooldownSec(Number(e.target.value))}
                                className="w-full px-3 py-2.5 rounded-lg bg-elevated border border-theme text-sm text-primary outline-none focus:border-accent/60"
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="rounded-xl border border-theme p-4 bg-elevated">
                        <p className="text-xs text-muted mb-2 font-medium uppercase tracking-wider">Preview</p>
                        <div className="flex items-start gap-2">
                            <div className="text-xs text-muted mt-0.5">When:</div>
                            <div>
                                <span className="text-xs bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-mono">
                                    {keyword || 'keyword'}
                                </span>
                                <span className="text-xs text-muted mx-1.5">
                                    ({matchType.toLowerCase()} match)
                                </span>
                                {priority > 0 && (
                                    <span className="text-xs bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                        P{priority}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-start gap-2 mt-1.5">
                            <div className="text-xs text-muted mt-0.5">Sends:</div>
                            <div className="text-xs text-secondary flex-1">
                                {replyMode === 'template' ? (
                                    <span className="text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                        <Layout size={10} />
                                        {selectedTemplate?.name || 'Rich Template'}
                                    </span>
                                ) : (
                                    <>
                                        {replyText ? <>&quot;{replyText.substring(0, 60)}{replyText.length > 60 ? '...' : ''}&quot;</> : 'reply text'}
                                        {selectedMedia && <span className="ml-1 text-emerald-600 dark:text-emerald-400">+ {selectedMedia.name}</span>}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {isError && (
                        <p className="text-xs text-red-600 dark:text-red-400">Failed to save automation. Please try again.</p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-lg bg-elevated text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            id="kw-submit"
                            disabled={isSubmitDisabled}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                            {isEdit ? 'Save Changes' : 'Create Automation'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Stats Badge ──────────────────────────────────────────────────────────────

function StatsBadge({ automationId }: { automationId: string }) {
    const { data } = useQuery<{ triggerCount: number; lastTriggeredAt: string | null }>({
        queryKey: ['kw-stats', automationId],
        queryFn: () => api.get(`/keyword-automations/${automationId}/stats`).then(r => r.data),
        staleTime: 30_000,
    });

    if (!data) return null;

    return (
        <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <TrendingUp size={10} />
            {data.triggerCount} triggers
        </div>
    );
}

// ── Main Tab Component ────────────────────────────────────────────────────────

export function KeywordAutomationsTab() {
    const qc = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [editingRule, setEditingRule] = useState<KeywordAutomation | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const { data, isLoading } = useQuery<KeywordAutomation[]>({
        queryKey: ['keyword-automations'],
        queryFn: () => api.get('/keyword-automations').then(r => Array.isArray(r.data) ? r.data : (Array.isArray(r) ? r : [])),
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

    const automations = Array.isArray(data) ? data : [];

    const matchTypeStyles: Record<string, string> = {
        CONTAINS: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
        EXACT: 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300',
        REGEX: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
        AI_INTENT: 'bg-pink-500/10 dark:bg-pink-500/15 text-pink-700 dark:text-pink-300',
    };

    const matchTypeIcons: Record<string, React.ReactNode> = {
        CONTAINS: <MessageSquare size={9} />,
        EXACT: <Check size={9} />,
        REGEX: <Regex size={9} />,
        AI_INTENT: <Brain size={9} />,
    };

    return (
        <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-primary">Keyword Automations</h3>
                    <p className="text-xs text-muted mt-0.5">
                        Instant replies triggered by keyword matching — text or rich templates
                    </p>
                </div>
                <button
                    id="kw-new-btn"
                    onClick={() => { setEditingRule(null); setShowModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-colors"
                >
                    <Plus size={14} />
                    New Automation
                </button>
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Zap size={14} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Unified Automation Engine</p>
                        <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                            Lead sends &quot;PRICE&quot; → System instantly replies with your pricing card or rich template → AI follows up → You close.
                            <br />
                            <span className="text-emerald-600 dark:text-emerald-400">Supports text, media, and interactive button templates in one place.</span>
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
                <div className="rounded-xl border border-theme p-10 text-center bg-elevated">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                        <Zap size={22} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="text-sm font-medium text-primary mb-1">No keyword automations yet</p>
                    <p className="text-xs text-muted mb-4">
                        Create your first one. When a lead texts &quot;price&quot;, they&apos;ll get your reply instantly.
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
                            : 'border-theme bg-elevated'
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            {/* Icon */}
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${auto.isActive
                                ? auto.template ? 'bg-purple-500/10 dark:bg-purple-500/20' : 'bg-emerald-500/10 dark:bg-emerald-500/20'
                                : 'bg-elevated'
                                }`}>
                                {auto.template
                                    ? <Layout size={16} className={auto.isActive ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-600'} />
                                    : <Zap size={16} className={auto.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600'} />
                                }
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                {/* Keyword + badges */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <code className="text-sm font-mono font-bold text-primary bg-elevated px-2 py-0.5 rounded-md">
                                        {auto.keyword}
                                    </code>
                                    <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${matchTypeStyles[auto.matchType] ?? 'bg-zinc-700 text-zinc-300'}`}>
                                        {matchTypeIcons[auto.matchType]}
                                        {auto.matchType}
                                    </span>
                                    {/* Priority badge — only shown if > 0 */}
                                    {auto.priority > 0 && (
                                        <span className="text-[10px] bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                            <ArrowUpDown size={8} />
                                            P{auto.priority}
                                        </span>
                                    )}
                                    {/* Reply mode badge */}
                                    {auto.template ? (
                                        <span className="text-[10px] bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                            <Layout size={8} />
                                            Template
                                        </span>
                                    ) : null}
                                    {auto.intent && (
                                        <span className="text-[10px] bg-orange-500/10 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
                                            {auto.intent}
                                        </span>
                                    )}
                                    <StatsBadge automationId={auto.id} />
                                </div>

                                {/* Reply preview */}
                                <p className="text-xs text-muted mt-1.5 line-clamp-2 leading-relaxed">
                                    {auto.template ? (
                                        <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                                            <Layout size={10} className="shrink-0" />
                                            {auto.template.name}
                                        </span>
                                    ) : (
                                        <>
                                            <MessageSquare size={10} className="inline mr-1 text-muted" />
                                            {auto.replyText}
                                        </>
                                    )}
                                </p>

                                {/* Meta */}
                                <div className="flex items-center gap-4 mt-2">
                                    {auto.media && !auto.template && (
                                        <div className="flex items-center gap-1 text-xs text-muted">
                                            <ImageIcon size={10} />
                                            {auto.media.name}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 text-xs text-muted">
                                        <Clock size={10} />
                                        {auto.cooldownSec}s cooldown
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    title="Edit"
                                    onClick={() => { setEditingRule(auto); setShowModal(true); }}
                                    className="p-1.5 rounded-lg hover:bg-hover transition-colors"
                                >
                                    <Pencil size={15} className="text-secondary hover:text-primary transition-colors" />
                                </button>
                                <button
                                    title={auto.isActive ? 'Disable' : 'Enable'}
                                    onClick={() => toggleMutation.mutate({ id: auto.id, isActive: !auto.isActive })}
                                    className="p-1.5 rounded-lg hover:bg-hover transition-colors"
                                >
                                    {auto.isActive
                                        ? <ToggleRight size={18} className="text-emerald-600 dark:text-emerald-400" />
                                        : <ToggleLeft size={18} className="text-muted" />}
                                </button>
                                {confirmDelete === auto.id ? (
                                    <div className="flex items-center gap-1">
                                        <button
                                            title="Confirm delete"
                                            aria-label="Confirm delete automation"
                                            onClick={() => deleteMutation.mutate(auto.id)}
                                            className="p-1.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 hover:bg-red-500/30 transition-colors"
                                        >
                                            <Check size={14} className="text-red-600 dark:text-red-400" />
                                        </button>
                                        <button
                                            title="Cancel delete"
                                            aria-label="Cancel delete"
                                            onClick={() => setConfirmDelete(null)}
                                            className="p-1.5 rounded-lg hover:bg-hover transition-colors"
                                        >
                                            <X size={14} className="text-muted" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        title="Delete"
                                        onClick={() => setConfirmDelete(auto.id)}
                                        className="p-1.5 rounded-lg hover:bg-hover transition-colors"
                                    >
                                        <Trash2 size={15} className="text-muted/70 hover:text-red-600 dark:text-red-400 transition-colors" />
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
                    editRule={editingRule}
                    onClose={() => { setShowModal(false); setEditingRule(null); }}
                    onSuccess={() => { setShowModal(false); setEditingRule(null); }}
                />
            )}
        </div>
    );
}
