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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Auto Replies</h2>
                    <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                        Automatically reply when an incoming message matches a keyword exactly.
                    </p>
                </div>
                {!showForm && (
                    <button
                        onClick={startCreate}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '8px', border: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        <Plus size={15} /> New Auto Reply
                    </button>
                )}
            </div>

            {/* Create / Edit Form */}
            {showForm && (
                <div style={{
                    background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px',
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Trigger Keyword
                        </label>
                        <input
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            placeholder='e.g. "price" or "delivery time"'
                            style={{
                                background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(99,102,241,0.25)',
                                borderRadius: '8px', padding: '10px 14px', color: '#e2e8f0',
                                fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box',
                            }}
                        />
                        <span style={{ fontSize: '11px', color: '#475569' }}>
                            Case-insensitive exact match. Spaces are supported (e.g. "delivery time").
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Reply Message
                        </label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder='What should be sent when this keyword is received?'
                            rows={4}
                            style={{
                                background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(99,102,241,0.25)',
                                borderRadius: '8px', padding: '10px 14px', color: '#e2e8f0',
                                fontSize: '14px', outline: 'none', width: '100%', resize: 'vertical', boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    {/* Media attachment */}
                    {selectedMedia ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '10px 14px', borderRadius: '8px',
                            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                        }}>
                            <img
                                src={getMediaPreviewUrl(selectedMedia.id)}
                                alt={selectedMedia.name}
                                style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <MediaTypeIcon type={selectedMedia.type} size={16} />
                            <span style={{ fontSize: '13px', color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {selectedMedia.name}
                            </span>
                            <button onClick={() => setSelectedMedia(null)} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowMediaPicker(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                                border: '1px dashed rgba(99,102,241,0.3)', background: 'none', color: '#6366f1',
                                fontSize: '13px', fontWeight: 500, alignSelf: 'flex-start',
                            }}
                        >
                            <Paperclip size={14} /> Attach Media (optional)
                        </button>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={handleSave}
                            disabled={saving || !keyword.trim() || !content.trim()}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '9px 20px', borderRadius: '8px', border: 'none',
                                background: saving ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff', fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                            {isCreating ? 'Create' : 'Save'}
                        </button>
                        <button
                            onClick={reset}
                            style={{
                                padding: '9px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                                background: 'none', color: '#94a3b8', fontSize: '13px', cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {isPending ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <Loader2 size={24} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
                </div>
            ) : autoReplies.length === 0 && !showForm ? (
                <div style={{
                    textAlign: 'center', padding: '60px 24px',
                    border: '1px dashed rgba(99,102,241,0.2)', borderRadius: '12px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
                }}>
                    <Bot size={32} style={{ color: '#475569' }} />
                    <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>No auto replies yet</p>
                    <button
                        onClick={startCreate}
                        style={{
                            marginTop: '4px', padding: '8px 20px', borderRadius: '8px', border: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        Create first auto reply
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {autoReplies.map((ar: any) => (
                        <div key={ar.id} style={{
                            display: 'flex', alignItems: 'flex-start', gap: '14px',
                            padding: '16px', borderRadius: '12px',
                            background: editingId === ar.id ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${editingId === ar.id ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        }}>
                            {/* Keyword badge */}
                            <div style={{
                                padding: '4px 10px', borderRadius: '6px', flexShrink: 0,
                                background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
                                fontSize: '12px', fontWeight: 700, color: '#10b981', fontFamily: 'monospace',
                            }}>
                                {ar.keyword}
                            </div>

                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.4 }}>
                                    {ar.content}
                                </p>
                                {ar.media && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                        <img
                                            src={getMediaPreviewUrl(ar.media.id)}
                                            alt={ar.media.name}
                                            style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px' }}
                                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        <span style={{ fontSize: '11px', color: '#475569' }}>+ {ar.media.name}</span>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                <button
                                    onClick={() => startEdit(ar)}
                                    style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#94a3b8', cursor: 'pointer' }}
                                >
                                    <Edit2 size={13} />
                                </button>
                                <button
                                    onClick={() => handleDelete(ar.id)}
                                    style={{ background: 'none', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '6px', color: '#ef4444', cursor: 'pointer' }}
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
