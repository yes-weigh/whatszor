'use client';

import { useState } from 'react';
import { useQuickReplies } from '@/hooks/use-quick-replies';
import { Plus, Trash2, Edit2, Loader2, Zap, Check } from 'lucide-react';

export function QuickRepliesTab() {
    const { quickReplies, isPending, createQuickReply, updateQuickReply, deleteQuickReply } = useQuickReplies();
    
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    
    const [shortcut, setShortcut] = useState('');
    const [content, setContent] = useState('');
    
    const [saving, setSaving] = useState(false);

    function startEdit(qr: any) {
        setEditingId(qr.id);
        setShortcut(qr.shortcut.replace('/', ''));
        setContent(qr.content);
        setIsCreating(false);
    }

    function startCreate() {
        setEditingId(null);
        setShortcut('');
        setContent('');
        setIsCreating(true);
    }

    function reset() {
        setEditingId(null);
        setIsCreating(false);
        setShortcut('');
        setContent('');
    }

    async function handleSave() {
        if (!shortcut.trim() || !content.trim()) return;
        setSaving(true);
        try {
            if (isCreating) {
                await createQuickReply({ shortcut: shortcut.trim(), content: content.trim() });
            } else if (editingId) {
                await updateQuickReply({ id: editingId, shortcut: shortcut.trim(), content: content.trim() });
            }
            reset();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this quick reply?')) return;
        await deleteQuickReply(id);
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                        <Zap size={20} className="text-accent" />
                        Quick Replies
                    </h2>
                    <p className="text-sm text-muted mt-1">
                        Create canned responses to quickly reply to common questions in the inbox.
                    </p>
                </div>
                {!isCreating && !editingId && (
                    <button 
                        onClick={startCreate}
                        className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors flex items-center gap-2"
                    >
                        <Plus size={16} />
                        New Quick Reply
                    </button>
                )}
            </div>

            {(isCreating || editingId) && (
                <div className="bg-elevated border border-theme rounded-xl p-5 mb-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-primary mb-4">
                        {isCreating ? 'Create Quick Reply' : 'Edit Quick Reply'}
                    </h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
                                Shortcut
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-mono bg-surface px-1.5 py-0.5 rounded text-xs border border-theme">/</span>
                                <input
                                    value={shortcut}
                                    onChange={(e) => setShortcut(e.target.value.replace(/\s+/g, '-').toLowerCase())}
                                    placeholder="pricing"
                                    className="w-full bg-surface border border-theme rounded-lg py-2 pl-10 pr-4 text-sm focus:border-accent text-primary outline-none transition-colors"
                                />
                            </div>
                            <p className="text-[10px] text-muted mt-1.5 ml-1">Must be one continuous word. Agents type this trigger to find the message.</p>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
                                Message Content
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Type the full response message here..."
                                rows={4}
                                className="w-full bg-surface border border-theme rounded-lg px-4 py-3 text-sm focus:border-accent text-primary outline-none transition-colors resize-y"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                onClick={reset}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-primary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !shortcut.trim() || !content.trim()}
                                className="bg-primary text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                Save Template
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0 bg-elevated border border-theme rounded-xl">
                {isPending && (
                    <div className="flex justify-center p-8">
                        <Loader2 size={24} className="animate-spin text-muted" />
                    </div>
                )}
                
                {!isPending && quickReplies.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                            <Zap size={28} className="text-accent" />
                        </div>
                        <h3 className="text-primary font-semibold">No quick replies yet</h3>
                        <p className="text-sm text-muted mt-1 max-w-sm">
                            Speed up your response times by creating pre-written answers for frequently asked questions.
                        </p>
                    </div>
                )}

                {!isPending && quickReplies.length > 0 && (
                    <div className="divide-y divide-theme">
                        {quickReplies.map(qr => (
                            <div key={qr.id} className="p-4 flex items-start justify-between gap-4 hover:bg-hover transition-colors group">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-mono text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-md border border-accent/20">
                                            {qr.shortcut}
                                        </span>
                                    </div>
                                    <p className="text-sm text-secondary line-clamp-2 leading-relaxed">
                                        {qr.content}
                                    </p>
                                </div>
                                
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => startEdit(qr)}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-surface border border-transparent hover:border-theme transition-all"
                                        title="Edit"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(qr.id)}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-red-400 hover:bg-red-400/10 border border-transparent hover:border-red-400/20 transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
