'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { X, Search, Send, Loader2, Link2, Phone, MessageSquare } from 'lucide-react';

function ButtonPreview({ btn }: { btn: any }) {
    const iconMap: Record<string, any> = {
        url: <Link2 size={11} className="shrink-0" />,
        URL: <Link2 size={11} className="shrink-0" />,
        call: <Phone size={11} className="shrink-0" />,
        PHONE_NUMBER: <Phone size={11} className="shrink-0" />,
        quick_reply: <MessageSquare size={11} className="shrink-0" />,
        QUICK_REPLY: <MessageSquare size={11} className="shrink-0" />,
        reply: <MessageSquare size={11} className="shrink-0" />,
    };
    return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-blue-400/40 bg-blue-400/10 text-blue-400 text-xs">
            {iconMap[btn.type] ?? <MessageSquare size={11} className="shrink-0" />}
            {btn.label}
        </span>
    );
}

export default function TemplatePickerModal({
    onClose,
    onSend,
}: {
    onClose: () => void;
    onSend: (templateVersionId: string, variables: Record<string, any>) => Promise<void>;
}) {
    const [search, setSearch] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [variables, setVariables] = useState<Record<string, string>>({});
    const [isSending, setIsSending] = useState(false);

    const { data: templates = [], isLoading } = useQuery({
        queryKey: ['templates'],
        queryFn: () =>
            api.get('/templates').then(r => {
                // Backend returns { templates: T[] } via sendSuccess({ templates })
                // After interceptor unwrap, r.data = { templates: T[] }
                const list: any[] = r.data.templates;
                return list.map((t: any) => {
                    const latestVersion = t.versions?.[0];
                    return {
                        ...t,
                        body: latestVersion?.messageText ?? t.body ?? '',
                        footerText: latestVersion?.footerText ?? '',
                        buttons: latestVersion?.buttons ?? [],
                        versionId: latestVersion?.id ?? null,
                    };
                });
            }),
    });

    // Extract variable placeholders from the body, e.g. {{contact.firstName}} or {{name}}
    const variableKeys: string[] = selectedTemplate?.body
        ? Array.from(new Set(
            Array.from(selectedTemplate.body.matchAll(/\{\{([^}]+)\}\}/g))
                .map((m: any) => (m[1] as string).trim())
          ))
        : [];

    // Human-readable label for a variable key (e.g. "contact.firstName" → "First Name")
    const labelFor = (key: string) => {
        const last = key.split('.').pop() ?? key;
        return last.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    const filtered = templates.filter((t: any) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.body || '').toLowerCase().includes(search.toLowerCase())
    );

    const handleSend = async () => {
        if (!selectedTemplate?.versionId) return;
        setIsSending(true);
        try {
            // Build a context object matching the renderTemplateVersion engine.
            // Supports both flat keys ({{name}}) and dot-notation ({{contact.firstName}}).
            const context: any = {};
            for (const key of variableKeys) {
                const parts = key.split('.');
                const value = variables[key] ?? '';
                if (parts.length === 1) {
                    // Flat key — add at top level AND inside 'contact' namespace for convenience
                    context[key] = value;
                    context.contact = context.contact ?? {};
                    context.contact[key] = value;
                } else {
                    // Nested: e.g. contact.firstName
                    let cur = context;
                    for (let i = 0; i < parts.length - 1; i++) {
                        cur[parts[i]] = cur[parts[i]] ?? {};
                        cur = cur[parts[i]];
                    }
                    cur[parts[parts.length - 1]] = value;
                }
            }

            await onSend(selectedTemplate.versionId, context);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-theme rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-theme shrink-0">
                    <h2 className="font-bold text-primary">Send Template</h2>
                    <button title="Close" aria-label="Close" onClick={onClose}>
                        <X size={18} className="text-muted hover:text-primary" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Template List */}
                    <div className="w-1/2 border-r border-theme flex flex-col bg-elevated">
                        <div className="p-3 border-b border-theme shrink-0">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-theme bg-surface">
                                <Search size={13} className="text-muted" />
                                <input
                                    autoFocus
                                    className="bg-transparent text-sm outline-none flex-1 text-primary placeholder:text-muted"
                                    placeholder="Search templates..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {isLoading && (
                                <div className="p-4 text-center text-muted">
                                    <Loader2 size={16} className="animate-spin inline" />
                                </div>
                            )}
                            {!isLoading && filtered.length === 0 && (
                                <p className="text-center text-xs text-muted py-4">No templates found.</p>
                            )}
                            {filtered.map((t: any) => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        setSelectedTemplate(t);
                                        setVariables({});
                                    }}
                                    className={`w-full text-left p-3 rounded-lg mb-1 transition-colors border ${
                                        selectedTemplate?.id === t.id
                                            ? 'bg-accent/10 border-accent/30 text-accent'
                                            : 'border-transparent hover:bg-hover'
                                    }`}
                                >
                                    <p className="font-semibold text-sm truncate">{t.name}</p>
                                    <p className="text-xs text-muted truncate mt-0.5">{t.body}</p>
                                    {t.buttons?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {t.buttons.slice(0, 2).map((b: any, i: number) => (
                                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-theme text-muted">
                                                    {b.label}
                                                </span>
                                            ))}
                                            {t.buttons.length > 2 && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-theme text-muted">
                                                    +{t.buttons.length - 2}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Template Preview & Variables */}
                    <div className="w-1/2 flex flex-col bg-surface">
                        {selectedTemplate ? (
                            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
                                {/* WhatsApp bubble preview */}
                                <div>
                                    <h3 className="font-semibold text-xs text-muted uppercase tracking-wide mb-2">Preview</h3>
                                    <div className="bg-[#dcf8c6] rounded-xl rounded-tl-none p-3 shadow-sm inline-block max-w-full">
                                        <p className="text-gray-800 text-xs leading-relaxed whitespace-pre-wrap">
                                            {selectedTemplate.body}
                                        </p>
                                        {selectedTemplate.footerText && (
                                            <p className="text-gray-500 text-[10px] mt-1 border-t border-gray-300/50 pt-1">
                                                {selectedTemplate.footerText}
                                            </p>
                                        )}
                                    </div>
                                    {/* Buttons preview */}
                                    {selectedTemplate.buttons?.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {selectedTemplate.buttons.map((b: any, i: number) => (
                                                <ButtonPreview key={i} btn={b} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Variable Inputs */}
                                {variableKeys.length > 0 && (
                                    <div>
                                        <h3 className="font-semibold text-xs text-muted uppercase tracking-wide mb-2">Fill Variables</h3>
                                        <div className="flex flex-col gap-2">
                                            {variableKeys.map((key: string) => (
                                                <div key={key}>
                                                    <label className="text-xs font-medium text-secondary mb-1 block">
                                                        {labelFor(key)}
                                                        <span className="text-muted font-normal ml-1 opacity-60">{`{{${key}}}`}</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-elevated border border-theme rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
                                                        placeholder={`Enter ${labelFor(key)}`}
                                                        value={variables[key] || ''}
                                                        onChange={e => setVariables({ ...variables, [key]: e.target.value })}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center p-6 text-center text-muted text-sm">
                                Select a template from the left to preview and fill variables.
                            </div>
                        )}
                        <div className="p-4 border-t border-theme shrink-0 flex justify-end">
                            <button
                                onClick={handleSend}
                                disabled={!selectedTemplate?.versionId || isSending}
                                className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                Send Template
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
