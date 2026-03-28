'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAutoReplies } from '@/hooks/use-auto-replies';
import { api } from '@/lib/api';
import {
    Plus, Trash2, Edit2, Loader2, Bot, Paperclip,
    X, Image, Video, FileText, LayoutTemplate, MessageSquare,
    ChevronDown,
} from 'lucide-react';
import { MediaPickerModal } from './MediaPickerModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function getToken(): string {
    return typeof window !== 'undefined' ? (localStorage.getItem('accessToken') || '') : '';
}
function getMediaPreviewUrl(id: string): string {
    return `${API_BASE}/media-gallery/${id}/file?token=${getToken()}`;
}
function MediaTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
    if (type === 'image') return <Image size={size} />;
    if (type === 'video') return <Video size={size} />;
    return <FileText size={size} />;
}

type ReplyMode = 'standard' | 'template';

interface SelectedMedia { id: string; name: string; type: string; mimeType?: string | null; }

// ── Fetch templates from the Template Studio ──────────────────────
function useTemplates() {
    return useQuery({
        queryKey: ['templates-for-auto-reply'],
        queryFn: async () => {
            const res = await api.get('/templates');
            return (res.data.templates || []) as Array<{
                id: string;
                name: string;
                versions: Array<{ id: string; messageText: string; buttons: any[] }>;
            }>;
        },
    });
}

export function AutoRepliesTab() {
    const { autoReplies, isPending, createAutoReply, updateAutoReply, deleteAutoReply } = useAutoReplies();
    const { data: templates = [] } = useTemplates();

    // ── Form state ────────────────────────────────────────────────
    const [editingId, setEditingId]       = useState<string | null>(null);
    const [isCreating, setIsCreating]     = useState(false);
    const [mode, setMode]                 = useState<ReplyMode>('standard');
    const [keyword, setKeyword]           = useState('');
    const [content, setContent]           = useState('');
    const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [saving, setSaving]             = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);

    // ── Helpers ───────────────────────────────────────────────────
    function switchMode(next: ReplyMode) {
        setMode(next);
        // Clear the other mode's data when switching
        if (next === 'template') {
            setContent('');
            setSelectedMedia(null);
        } else {
            setSelectedTemplateId(null);
        }
    }

    function startEdit(ar: any) {
        setEditingId(ar.id);
        setKeyword(ar.keyword || '');
        setIsCreating(false);

        if (ar.templateId && ar.template) {
            setMode('template');
            setSelectedTemplateId(ar.templateId);
            setContent('');
            setSelectedMedia(null);
        } else {
            setMode('standard');
            setContent(ar.content || '');
            setSelectedMedia(ar.media
                ? { id: ar.media.id, name: ar.media.name, type: ar.media.type, mimeType: ar.media.mimeType }
                : null);
            setSelectedTemplateId(null);
        }
    }

    function startCreate() {
        setEditingId(null);
        setKeyword('');
        setContent('');
        setSelectedMedia(null);
        setSelectedTemplateId(null);
        setMode('standard');
        setIsCreating(true);
    }

    function reset() {
        setEditingId(null);
        setIsCreating(false);
        setKeyword('');
        setContent('');
        setSelectedMedia(null);
        setSelectedTemplateId(null);
        setMode('standard');
    }

    const canSave = keyword.trim() && (
        mode === 'template' ? !!selectedTemplateId : content.trim()
    );

    async function handleSave() {
        if (!canSave) return;
        setSaving(true);
        try {
            const base = mode === 'template'
                ? { keyword: keyword.trim(), templateId: selectedTemplateId!, content: undefined, mediaId: null }
                : { keyword: keyword.trim(), content: content.trim(), mediaId: selectedMedia?.id ?? null, templateId: null };

            if (isCreating) {
                await createAutoReply(base as any);
            } else if (editingId) {
                await updateAutoReply({ id: editingId, ...base });
            }
            reset();
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this auto reply?')) return;
        await deleteAutoReply(id);
    }

    const showForm = isCreating || editingId !== null;

    // ── Selected template preview ─────────────────────────────────
    const pickedTemplate = templates.find(t => t.id === selectedTemplateId);
    const pickedVersionPreview = pickedTemplate?.versions?.[0];

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-slate-100 m-0">Auto Replies</h2>
                    <p className="text-[13px] text-slate-500 mt-1">
                        Automatically reply when an incoming message matches a keyword exactly.
                    </p>
                </div>
                {!showForm && (
                    <button
                        onClick={startCreate}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-none bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[13px] font-semibold cursor-pointer"
                    >
                        <Plus size={15} /> New Auto Reply
                    </button>
                )}
            </div>

            {/* Create / Edit Form */}
            {showForm && (
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-5 flex flex-col gap-4">

                    {/* Keyword */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Trigger Keyword
                        </label>
                        <input
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            placeholder='e.g. "price" or "delivery time"'
                            className="bg-slate-900/60 border border-indigo-500/25 rounded-lg px-3.5 py-2.5 text-slate-200 text-sm outline-none w-full box-border"
                        />
                        <span className="text-[11px] text-slate-500">
                            Case-insensitive exact match. Spaces are supported (e.g. &quot;delivery time&quot;).
                        </span>
                    </div>

                    {/* Mode toggle */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => switchMode('standard')}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium border cursor-pointer transition-all ${
                                mode === 'standard'
                                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                                    : 'bg-transparent border-white/10 text-slate-500'
                            }`}
                        >
                            <MessageSquare size={13} /> Standard Message
                        </button>
                        <button
                            onClick={() => switchMode('template')}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium border cursor-pointer transition-all ${
                                mode === 'template'
                                    ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                                    : 'bg-transparent border-white/10 text-slate-500'
                            }`}
                        >
                            <LayoutTemplate size={13} /> Rich Template
                        </button>
                    </div>

                    {/* ── Standard mode ─────────────────────────────── */}
                    {mode === 'standard' && (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    Reply Message
                                </label>
                                <textarea
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    placeholder="What should be sent when this keyword is received?"
                                    rows={4}
                                    className="bg-slate-900/60 border border-indigo-500/25 rounded-lg px-3.5 py-2.5 text-slate-200 text-sm outline-none w-full resize-y box-border"
                                />
                            </div>

                            {/* Media attachment */}
                            {selectedMedia ? (
                                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                    <img
                                        src={getMediaPreviewUrl(selectedMedia.id)}
                                        alt={selectedMedia.name}
                                        className="w-9 h-9 object-cover rounded-md flex-shrink-0"
                                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                    <MediaTypeIcon type={selectedMedia.type} size={16} />
                                    <span className="text-[13px] text-slate-200 flex-1 overflow-hidden overflow-ellipsis whitespace-nowrap">
                                        {selectedMedia.name}
                                    </span>
                                    <button
                                        title="Remove attached media"
                                        onClick={() => setSelectedMedia(null)}
                                        className="text-slate-500 bg-transparent border-none cursor-pointer p-0.5"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowMediaPicker(true)}
                                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg cursor-pointer border border-dashed border-indigo-500/30 bg-transparent text-indigo-400 text-[13px] font-medium self-start"
                                >
                                    <Paperclip size={14} /> Attach Media (optional)
                                </button>
                            )}
                        </>
                    )}

                    {/* ── Template mode ─────────────────────────────── */}
                    {mode === 'template' && (
                        <div className="flex flex-col gap-3">
                            <label
                                htmlFor="auto-reply-template-select"
                                className="text-xs font-semibold text-slate-400 uppercase tracking-wider"
                            >
                                Select Template
                            </label>

                            {templates.length === 0 ? (
                                <p className="text-[13px] text-slate-500 italic">
                                    No templates found. Create one in the Template Studio first.
                                </p>
                            ) : (
                                <div className="relative">
                                    <select
                                        id="auto-reply-template-select"
                                        title="Select a template for auto reply"
                                        value={selectedTemplateId ?? ''}
                                        onChange={e => setSelectedTemplateId(e.target.value || null)}
                                        className="appearance-none w-full bg-slate-900/60 border border-violet-500/25 rounded-lg px-3.5 py-2.5 text-slate-200 text-sm outline-none pr-9 cursor-pointer box-border"
                                    >
                                        <option value="" disabled>— Choose a template —</option>
                                        {templates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                                </div>
                            )}

                            {/* Preview of picked template */}
                            {pickedTemplate && pickedVersionPreview && (
                                <div className="rounded-lg bg-violet-500/8 border border-violet-500/20 p-3.5 flex flex-col gap-2">
                                    <p className="text-[12px] font-semibold text-violet-400 uppercase tracking-wide m-0">Preview</p>
                                    <p className="text-[13px] text-slate-300 m-0 whitespace-pre-line leading-relaxed">
                                        {pickedVersionPreview.messageText}
                                    </p>
                                    {pickedVersionPreview.buttons?.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {pickedVersionPreview.buttons.map((b: any, i: number) => (
                                                <span
                                                    key={i}
                                                    className="px-2.5 py-1 rounded-full text-[11px] bg-violet-500/15 border border-violet-500/30 text-violet-300 font-medium"
                                                >
                                                    {b.label}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-[11px] text-slate-600 m-0 mt-1">
                                        Existing text and media will be ignored — only this template will be sent.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2.5">
                        <button
                            onClick={handleSave}
                            disabled={saving || !canSave}
                            className={`flex items-center gap-1.5 px-5 py-2 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer ${
                                saving || !canSave
                                    ? 'bg-indigo-500/40 cursor-not-allowed'
                                    : 'bg-gradient-to-br from-indigo-500 to-violet-500'
                            }`}
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                            {isCreating ? 'Create' : 'Save'}
                        </button>
                        <button
                            onClick={reset}
                            className="px-4 py-2 rounded-lg border border-white/10 bg-transparent text-slate-400 text-[13px] cursor-pointer"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {isPending ? (
                <div className="flex justify-center p-10">
                    <Loader2 size={24} className="text-indigo-500 animate-spin" />
                </div>
            ) : autoReplies.length === 0 && !showForm ? (
                <div className="text-center py-16 px-6 border border-dashed border-indigo-500/20 rounded-xl flex flex-col items-center gap-3">
                    <Bot size={32} className="text-slate-600" />
                    <p className="text-slate-500 text-sm m-0">No auto replies yet</p>
                    <button
                        onClick={startCreate}
                        className="mt-1 px-5 py-2 rounded-lg border-none bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[13px] font-semibold cursor-pointer"
                    >
                        Create first auto reply
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-2.5">
                    {(autoReplies as any[]).map((ar: any) => (
                        <div
                            key={ar.id}
                            className={`flex items-start gap-3.5 p-4 rounded-xl border ${
                                editingId === ar.id ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-white/5 border-white/10'
                            }`}
                        >
                            {/* Keyword badge */}
                            <div className="px-2.5 py-1 rounded-md flex-shrink-0 bg-emerald-500/15 border border-emerald-500/25 text-xs font-bold text-emerald-400 font-mono">
                                {ar.keyword}
                            </div>

                            <div className="flex-1 overflow-hidden">
                                {ar.template ? (
                                    /* Template mode summary */
                                    <div className="flex items-center gap-2">
                                        <LayoutTemplate size={13} className="text-violet-400 flex-shrink-0" />
                                        <span className="text-[13px] text-violet-300 font-medium truncate">
                                            {ar.template.name}
                                        </span>
                                        {ar.template.versions?.[0]?.buttons?.length > 0 && (
                                            <span className="text-[11px] text-slate-500">
                                                · {ar.template.versions[0].buttons.length} button{ar.template.versions[0].buttons.length !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    /* Standard mode summary */
                                    <>
                                        <p className="m-0 mb-1 text-[13px] text-slate-300 leading-snug line-clamp-2">
                                            {ar.content}
                                        </p>
                                        {ar.media && (
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <img
                                                    src={getMediaPreviewUrl(ar.media.id)}
                                                    alt={ar.media.name}
                                                    className="w-7 h-7 object-cover rounded"
                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                                <span className="text-[11px] text-slate-600">+ {ar.media.name}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-1.5 flex-shrink-0">
                                <button
                                    title="Edit auto reply"
                                    onClick={() => startEdit(ar)}
                                    className="bg-transparent border border-white/10 rounded-md p-1.5 text-slate-400 cursor-pointer hover:border-indigo-500/30 hover:text-indigo-400 transition-colors"
                                >
                                    <Edit2 size={13} />
                                </button>
                                <button
                                    title="Delete auto reply"
                                    onClick={() => handleDelete(ar.id)}
                                    className="bg-transparent border border-red-500/20 rounded-md p-1.5 text-red-500 cursor-pointer hover:bg-red-500/10 transition-colors"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showMediaPicker && (
                <MediaPickerModal
                    onSelect={(media: any) => {
                        setSelectedMedia({ id: media.id, name: media.name, type: media.type, mimeType: media.mimeType });
                        setShowMediaPicker(false);
                    }}
                    onClose={() => setShowMediaPicker(false)}
                />
            )}
        </div>
    );
}
