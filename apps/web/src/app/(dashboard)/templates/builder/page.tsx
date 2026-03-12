'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Info, Plus, Trash2, Smartphone, HelpCircle } from 'lucide-react';
import Link from 'next/link';

function TemplateBuilder() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const existingId = searchParams.get('id');
    const qc = useQueryClient();

    const [form, setForm] = useState({
        name: '',
        category: 'MARKETING',
        language: 'en_US',
        messageText: '',
        footerText: '',
        headerMediaId: '',
    });
    const [buttons, setButtons] = useState<any[]>([]);
    const [previewVars, setPreviewVars] = useState<Record<string, string>>({});

    const { data: mediaList = [] } = useQuery({
        queryKey: ['media'],
        queryFn: () => api.get('/media-gallery').then(r => r.data?.media || []),
    });

    const { data: existingTemplate } = useQuery({
        queryKey: ['templates', existingId],
        queryFn: () => api.get(`/templates/${existingId}`).then(r => r.data),
        enabled: !!existingId
    });

    useEffect(() => {
        if (existingTemplate) {
            const latest = existingTemplate.versions?.[0] || {};
            setForm({
                name: existingTemplate.name,
                category: existingTemplate.category,
                language: existingTemplate.language,
                messageText: latest.messageText || '',
                footerText: latest.footerText || '',
                headerMediaId: latest.headerMediaId || '',
            });
            setButtons(latest.buttons || []);
        }
    }, [existingTemplate]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = { ...form, buttons };
            if (existingId) {
                // Creates a new Version under the existing template
                return api.put(`/templates/${existingId}/versions`, payload);
            } else {
                // Creates Root + Version 1
                return api.post('/templates', payload);
            }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['templates'] });
            router.push('/templates');
        },
        onError: (err: any) => {
            alert(err.response?.data?.message || 'Error saving template');
        }
    });

    // Detect variables automatically for preview inputs
    useEffect(() => {
        const matches = [...form.messageText.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
        const newVars: Record<string, string> = { ...previewVars };
        matches.forEach(m => { if (!(m in newVars)) newVars[m] = `{${m}}`; });
        // Clean removed variables
        Object.keys(newVars).forEach(k => { if (!matches.includes(k)) delete newVars[k]; });
        setPreviewVars(newVars);
    }, [form.messageText]); // eslint-disable-line react-hooks/exhaustive-deps

    const renderPreviewText = () => {
        let text = form.messageText;
        Object.entries(previewVars).forEach(([key, val]) => {
            text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
        });
        return text;
    };

    const selectedMedia = mediaList.find((m: any) => m.id === form.headerMediaId);

    return (
        <div className="flex flex-col h-full bg-surface">
            <div className="flex items-center gap-4 p-4 border-b border-theme bg-elevated sticky top-0 z-10">
                <Link href="/templates" className="btn text-muted hover:text-primary p-2"><ChevronLeft size={20} /></Link>
                <div>
                    <h1 className="text-xl font-bold text-primary">{existingId ? 'Edit Template' : 'Create Template'}</h1>
                    <p className="text-sm text-muted">{existingId ? 'Saves will generate a new immutable version' : 'Design a reusable outbound message'}</p>
                </div>
                <div className="ml-auto flex gap-3">
                    <button className="btn btn-secondary" onClick={() => router.push('/templates')}>Cancel</button>
                    <button 
                        className="btn btn-primary" 
                        onClick={() => saveMutation.mutate()} 
                        disabled={saveMutation.isPending || !form.name || !form.messageText}
                    >
                        {saveMutation.isPending ? 'Saving...' : 'Save Template'}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Editor Panel */}
                <div className="flex-1 border-r border-theme overflow-y-auto p-6 space-y-8">
                    
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-primary">Basic Settings</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group col-span-2">
                                <label className="form-label text-sm text-secondary font-medium block mb-1">Template Name</label>
                                <input 
                                    className="input w-full p-2 border border-theme rounded-md bg-surface" 
                                    placeholder="e.g. welcome_offer_01" 
                                    value={form.name} 
                                    onChange={e => setForm({...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')})}
                                    disabled={!!existingId} // Cannot change name of existing template
                                />
                                {existingId && <p className="text-[10px] text-muted mt-1">Name is immutable for existing templates.</p>}
                            </div>
                        </div>
                    </div>

                    <hr className="border-theme" />

                    {/* Media Header */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-primary">Header Media</h2>
                            <span className="text-xs text-muted">(Optional)</span>
                        </div>
                        <select 
                            title="Select Header Media"
                            className="input w-full p-2 border border-theme rounded-md bg-surface" 
                            value={form.headerMediaId} 
                            onChange={e => setForm({...form, headerMediaId: e.target.value})}
                        >
                            <option value="">No Media Attached</option>
                            {mediaList.map((m: any) => (
                                <option key={m.id} value={m.id}>{m.name} ({m.type.toUpperCase()})</option>
                            ))}
                        </select>
                        {!mediaList.length && (
                            <p className="text-xs text-yellow-500 mt-1 flex items-center gap-1"><Info size={12}/> No media available. Upload to the Media Gallery first.</p>
                        )}
                    </div>

                    {/* Content */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-primary">Message Body</h2>
                        </div>
                        <div className="form-group border border-theme rounded-lg focus-within:border-accent transition-colors bg-surface overflow-hidden">
                            <textarea 
                                className="w-full p-3 bg-transparent resize-none min-h-[150px] outline-none" 
                                placeholder="Hello {{contact.name}}, check out our new..."
                                value={form.messageText}
                                onChange={e => setForm({...form, messageText: e.target.value})}
                            />
                        </div>
                        <div className="bg-elevated p-3 rounded-lg border border-theme text-xs text-muted flex items-start gap-2">
                            <HelpCircle size={14} className="shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-secondary">Variables Guide</p>
                                <p>Use syntax <code className="bg-theme px-1 rounded text-primary">{"{{"}namespace.field{"}}"}</code>. Allowed namespaces: <strong>contact, conversation, workspace, event</strong>.</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-primary">Footer <span className="text-xs font-normal text-muted">(Optional)</span></h2>
                        <input 
                            className="input w-full p-2 border border-theme rounded-md bg-surface" 
                            placeholder="e.g. Reply STOP to opt out" 
                            value={form.footerText} 
                            onChange={e => setForm({...form, footerText: e.target.value})}
                            maxLength={60}
                        />
                    </div>

                    <hr className="border-theme" />

                    {/* Buttons */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-primary">Interactive Buttons</h2>
                            <button 
                                className="btn btn-secondary text-xs flex items-center gap-1 p-1 px-2"
                                onClick={() => {
                                    if(buttons.length >= 3) return alert('Max 3 buttons allowed');
                                    setButtons([...buttons, { type: 'quick_reply', label: 'New Button', payload: '' }]);
                                }}
                            >
                                <Plus size={12} /> Add Button
                            </button>
                        </div>

                        {buttons.length === 0 ? (
                            <p className="text-sm text-muted italic">No buttons added.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {buttons.map((btn, idx) => (
                                    <div key={idx} className="flex flex-col gap-2 bg-elevated p-2 rounded-lg border border-theme">
                                        <div className="flex gap-2 items-center">
                                            <select 
                                                title="Select Button Type"
                                                className="p-2 border border-theme rounded bg-surface w-32 shrink-0"
                                                value={btn.type}
                                                onChange={e => {
                                                    const newB = [...buttons];
                                                    newB[idx].type = e.target.value;
                                                    setButtons(newB);
                                                }}
                                            >
                                                <option value="quick_reply">Quick Reply</option>
                                                <option value="url">URL Link</option>
                                                <option value="call">Phone Call</option>
                                            </select>
                                            <input 
                                                className="p-2 border border-theme rounded bg-surface flex-1"
                                                placeholder="Label"
                                                value={btn.label}
                                                onChange={e => {
                                                    const newB = [...buttons];
                                                    newB[idx].label = e.target.value;
                                                    setButtons(newB);
                                                }}
                                                maxLength={25}
                                            />
                                            <button 
                                                title="Remove Button"
                                                className="p-2 text-red-500 hover:bg-red-500/10 rounded-md transition-colors shrink-0"
                                                onClick={() => setButtons(buttons.filter((_, i) => i !== idx))}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        {(btn.type === 'url' || btn.type === 'call') && (
                                            <div className="flex gap-2 items-center pl-1 mt-1">
                                                <div className="w-32 shrink-0 text-xs text-muted font-medium pr-2 text-right">
                                                    {btn.type === 'url' ? 'Link URL:' : 'Phone Number:'}
                                                </div>
                                                <input
                                                    className="p-2 border border-theme rounded bg-surface border-dotted flex-1 text-sm bg-transparent"
                                                    placeholder={btn.type === 'url' ? 'https://example.com' : '+1234567890'}
                                                    value={btn.payload || ''}
                                                    onChange={e => {
                                                        const newB = [...buttons];
                                                        newB[idx].payload = e.target.value;
                                                        setButtons(newB);
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Live Preview Panel */}
                <div className="w-[400px] bg-theme/50 p-6 flex flex-col hidden lg:flex">
                    <h2 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2"><Smartphone size={18}/> Realistic Preview</h2>
                    
                    {/* Variable Mock Editor */}
                    {Object.keys(previewVars).length > 0 && (
                        <div className="mb-6 bg-surface p-4 rounded-xl border border-theme shadow-sm">
                            <h3 className="text-xs font-bold text-muted uppercase mb-3 tracking-wider">Simulate Variables</h3>
                            <div className="flex flex-col gap-2">
                                {Object.entries(previewVars).map(([key, value]) => (
                                    <div key={key} className="flex flex-col">
                                        <label className="text-xs text-secondary mb-1 truncate font-mono">{key}</label>
                                        <input 
                                            title={`Simulate value for ${key}`}
                                            className="p-1.5 text-sm bg-elevated border border-theme rounded outline-none focus:border-accent"
                                            value={value}
                                            onChange={e => setPreviewVars({...previewVars, [key]: e.target.value})}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mock Device */}
                    <div className="flex-1 flex justify-center mt-4">
                        <div className="w-[320px] bg-[#EFEAE2] rounded-3xl border-8 border-gray-800 shadow-xl overflow-hidden flex flex-col relative h-[520px]">
                            {/* App Bar */}
                            <div className="h-14 bg-[#00A884] text-white flex items-center px-4 shrink-0 shadow z-10">
                                <span className="font-semibold">{form.name || 'Your Brand'}</span>
                            </div>
                            
                            {/* Chat Thread */}
                            <div className="flex-1 p-4 overflow-y-auto">
                                <div className="bg-white rounded-lg rounded-tl-none p-1 shadow-sm max-w-[90%] relative break-words">
                                    
                                    {/* Media Attachment Preview */}
                                    {selectedMedia && (
                                        <div className="w-full h-32 bg-gray-100 rounded mb-1 overflow-hidden flex items-center justify-center relative">
                                            {selectedMedia.type === 'video' || selectedMedia.type === 'document' ? (
                                                <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                                                    <span className="text-xs font-bold text-gray-400">[{selectedMedia.type.toUpperCase()}]</span>
                                                </div>
                                            ) : (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img 
                                                    src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/media-gallery/${selectedMedia.id}/file?token=${typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''}`} 
                                                    alt="" 
                                                    className="w-full h-full object-cover" 
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Text Body */}
                                    <div className="px-2 py-1 text-sm text-gray-800 whitespace-pre-wrap">
                                        {renderPreviewText() || <span className="text-gray-400 italic">Message goes here...</span>}
                                    </div>
                                    
                                    {/* Footer */}
                                    {form.footerText && (
                                        <div className="px-2 pb-1 text-xs text-gray-400 mt-1">
                                            {form.footerText}
                                        </div>
                                    )}
                                </div>

                                {/* Buttons Preview */}
                                {buttons.length > 0 && (
                                    <div className="flex flex-col gap-1 mt-1 max-w-[90%]">
                                        {buttons.map((b, i) => (
                                            <div key={i} className="bg-white rounded-lg shadow-sm py-2 px-4 text-center text-[#00A884] text-sm font-medium border-t-0 hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-2">
                                                {b.type === 'url' ? '↗' : b.type === 'call' ? '📞' : ''} {b.label || 'Action'}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default function TemplateBuilderPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-muted">Loading builder...</div>}>
            <TemplateBuilder />
        </Suspense>
    );
}

