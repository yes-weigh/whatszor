'use client';

import { useState } from 'react';
import { useAutoReplies } from '@/hooks/use-auto-replies';
import { Plus, Trash2, Edit2, Loader2, Bot, Paperclip, X, Image, Video, FileText } from 'lucide-react';
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

interface SelectedMedia { id: string; name: string; type: string; mimeType?: string | null; }

export function AutoRepliesTab() {
    const { autoReplies, isPending, createAutoReply, updateAutoReply, deleteAutoReply } = useAutoReplies();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [content, setContent] = useState('');
    const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
    const [saving, setSaving] = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);

    function startEdit(ar: any) {
        setEditingId(ar.id);
        setKeyword(ar.keyword || '');
        setContent(ar.content);
        setSelectedMedia(ar.media ? { id: ar.media.id, name: ar.media.name, type: ar.media.type, mimeType: ar.media.mimeType } : null);
        setIsCreating(false);
    }

    function startCreate() {
        setEditingId(null);
        setKeyword('');
        setContent('');
        setSelectedMedia(null);
        setIsCreating(true);
    }

    function reset() {
        setEditingId(null);
        setIsCreating(false);
        setKeyword('');
        setContent('');
        setSelectedMedia(null);
    }

    async function handleSave() {
        if (!keyword.trim() || !content.trim()) return;
        setSaving(true);
        try {
            if (isCreating) {
                await createAutoReply({ keyword: keyword.trim(), content: content.trim(), mediaId: selectedMedia?.id ?? null });
            } else if (editingId) {
                await updateAutoReply({ id: editingId, keyword: keyword.trim(), content: content.trim(), mediaId: selectedMedia?.id ?? null });
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

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Reply Message
                        </label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder='What should be sent when this keyword is received?'
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
                            <button title="Remove attached media" onClick={() => setSelectedMedia(null)} className="text-slate-500 bg-transparent border-none cursor-pointer p-0.5">
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowMediaPicker(true)}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg cursor-pointer border border-dashed border-indigo-500/30 bg-transparent text-indigo-500 text-[13px] font-medium self-start"
                        >
                            <Paperclip size={14} /> Attach Media (optional)
                        </button>
                    )}

                    <div className="flex gap-2.5">
                        <button
                            onClick={handleSave}
                            disabled={saving || !keyword.trim() || !content.trim()}
                            className={`flex items-center gap-1.5 px-5 py-2 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer ${
                                saving ? 'bg-indigo-500/50 cursor-not-allowed' : 'bg-gradient-to-br from-indigo-500 to-violet-500'
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
                    {autoReplies.map((ar: any) => (
                        <div key={ar.id} className={`flex items-start gap-3.5 p-4 rounded-xl border ${
                            editingId === ar.id ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-white/5 border-white/10'
                        }`}>
                            {/* Keyword badge */}
                            <div className="px-2.5 py-1 rounded-md flex-shrink-0 bg-emerald-500/15 border border-emerald-500/25 text-xs font-bold text-emerald-500 font-mono">
                                {ar.keyword}
                            </div>

                            <div className="flex-1 overflow-hidden">
                                <p className="m-0 mb-1 text-[13px] text-slate-300 leading-snug">
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
                            </div>

                            {/* Actions */}
                            <div className="flex gap-1.5 flex-shrink-0">
                                <button
                                    title="Edit auto reply"
                                    onClick={() => startEdit(ar)}
                                    className="bg-transparent border border-white/10 rounded-md p-1.5 text-slate-400 cursor-pointer"
                                >
                                    <Edit2 size={13} />
                                </button>
                                <button
                                    title="Delete auto reply"
                                    onClick={() => handleDelete(ar.id)}
                                    className="bg-transparent border border-red-500/20 rounded-md p-1.5 text-red-500 cursor-pointer"
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
                    onSelect={(media: any) => { setSelectedMedia({ id: media.id, name: media.name, type: media.type, mimeType: media.mimeType }); setShowMediaPicker(false); }}
                    onClose={() => setShowMediaPicker(false)}
                />
            )}
        </div>
    );
}
