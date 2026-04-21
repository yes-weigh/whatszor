'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    ChevronLeft, Info, Plus, Trash2, Smartphone, HelpCircle,
    Video, FileText, ImageIcon, ArrowUpRight, Phone, Zap, Save, Sparkles, Loader2
} from 'lucide-react';
import Link from 'next/link';

// ── Input primitives with the design system ───────────────────

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
    return (
        <label className="flex items-center gap-2 text-[12px] font-semibold text-white/60 uppercase tracking-wider mb-1.5">
            {children}
            {optional && <span className="font-normal normal-case tracking-normal text-[11px] text-muted">(optional)</span>}
        </label>
    );
}

function FormInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={`w-full px-3 py-2 rounded-md text-[13px] text-white bg-[#111111] border border-[rgba(255,255,255,0.06)] outline-none focus:border-[rgba(34,197,94,0.4)] focus:ring-1 focus:ring-[rgba(34,197,94,0.15)] placeholder:text-white/20 transition-all duration-[120ms] disabled:opacity-40 disabled:cursor-not-allowed ${props.className ?? ''}`}
        />
    );
}

function FormSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={`w-full px-3 py-2 rounded-md text-[13px] text-white bg-[#111111] border border-[rgba(255,255,255,0.06)] outline-none focus:border-[rgba(34,197,94,0.4)] transition-all duration-[120ms] ${props.className ?? ''}`}
        />
    );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-white/90 tracking-tight">{title}</h2>
                {action}
            </div>
            {children}
        </div>
    );
}

function Divider() {
    return <div className="h-px bg-[rgba(255,255,255,0.05)]" />;
}

// ── Builder ───────────────────────────────────────────────────

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
    const [testSessionId, setTestSessionId] = useState('');
    const [testPhoneNumber, setTestPhoneNumber] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const previewRef = useRef<HTMLDivElement>(null);

    /**
     * For each <video> in the container:
     *  1. Fetches the video file as a Blob so we can create a same-origin blob:// URL.
     *     This sidesteps the browser's canvas-taint restriction that blocks ctx.drawImage()
     *     on cross-origin video elements (localhost:3001 served via the API).
     *  2. Loads a hidden off-screen video, seeks to 0.5 s, draws the frame.
     *  3. Falls back to a dark placeholder + play-icon if fetch/seek times out.
     *  4. Replaces the live <video> with the stub canvas in the DOM.
     *  Returns a cleanup fn that restores the original DOM.
     */
    const substituteVideos = async (container: HTMLElement): Promise<() => void> => {
        const restores: Array<() => void> = [];
        const videos = Array.from(container.querySelectorAll<HTMLVideoElement>('video'));

        for (const video of videos) {
            const w = video.offsetWidth || 280;
            const h = video.offsetHeight || 128;

            // ── Try to grab a real video frame ───────────────────────────────
            let frameDataUrl: string | null = null;
            try {
                // Token is already embedded in video.src as ?token=…
                const resp = await fetch(video.src);
                if (resp.ok) {
                    const blob = await resp.blob();
                    const blobUrl = URL.createObjectURL(blob); // same-origin → no canvas taint
                    frameDataUrl = await new Promise<string | null>((resolve) => {
                        const tmp = document.createElement('video');
                        tmp.muted = true;
                        tmp.playsInline = true;
                        tmp.preload = 'auto';
                        tmp.src = blobUrl;
                        let done = false;
                        const finish = (result: string | null) => {
                            if (done) return;
                            done = true;
                            URL.revokeObjectURL(blobUrl);
                            resolve(result);
                        };
                        tmp.onseeked = () => {
                            try {
                                const fc = document.createElement('canvas');
                                fc.width = w * 2;
                                fc.height = h * 2;
                                const ctx = fc.getContext('2d');
                                if (ctx) {
                                    ctx.scale(2, 2);
                                    ctx.drawImage(tmp, 0, 0, w, h);
                                }
                                finish(fc.toDataURL('image/jpeg', 0.85));
                            } catch { finish(null); }
                        };
                        tmp.onerror = () => finish(null);
                        // Timeout: if video takes > 6 s to seek, use placeholder
                        setTimeout(() => finish(null), 6000);
                        tmp.load();
                        tmp.addEventListener('loadedmetadata', () => { tmp.currentTime = 0.5; });
                    });
                }
            } catch { /* fall through to placeholder */ }

            // ── Build the stub canvas ─────────────────────────────────────────
            const stub = document.createElement('canvas');
            stub.width = w * 2;
            stub.height = h * 2;
            stub.style.cssText = `display:block;width:${w}px;height:${h}px;`;

            const ctx = stub.getContext('2d');
            if (ctx) {
                ctx.scale(2, 2);
                if (frameDataUrl) {
                    // Draw the real video frame
                    const img = new Image();
                    await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); img.src = frameDataUrl!; });
                    ctx.drawImage(img, 0, 0, w, h);
                    // Slight darkening overlay so the play icon pops
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(0, 0, w, h);
                } else {
                    // Fallback: WA dark background
                    ctx.fillStyle = '#000d15';
                    ctx.fillRect(0, 0, w, h);
                }
                // Play-button circle
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.beginPath();
                ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2);
                ctx.fill();
                // Play triangle
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.beginPath();
                ctx.moveTo(w / 2 - 6, h / 2 - 9);
                ctx.lineTo(w / 2 + 11, h / 2);
                ctx.lineTo(w / 2 - 6, h / 2 + 9);
                ctx.closePath();
                ctx.fill();
            }

            video.insertAdjacentElement('beforebegin', stub);
            const prevDisplay = video.style.display;
            video.style.display = 'none';
            restores.push(() => { stub.remove(); video.style.display = prevDisplay; });
        }

        return () => restores.forEach(r => r());
    };

    /**
     * Captures the Live Preview WA bubble as a PNG blob.
     * Must be called while the component is still mounted (previewRef is valid).
     * Returns null on any failure — never throws.
     */
    const capturePreviewBlob = async (): Promise<Blob | null> => {
        if (!previewRef.current) return null;
        // substituteVideos is now async — must await before html2canvas runs
        const restore = await substituteVideos(previewRef.current);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(previewRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#0B1418',
                logging: false,
            });
            return await new Promise<Blob>((res, rej) =>
                canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob returned null')), 'image/png', 0.92)
            );
        } catch (e) {
            console.warn('[preview-capture] canvas capture failed:', e);
            return null;
        } finally {
            restore(); // always restore the original <video> elements
        }
    };


    /** Uploads a pre-captured blob to the API. Fire-and-forget safe. */
    const uploadPreviewBlob = async (templateId: string, blob: Blob) => {
        const fd = new FormData();
        fd.append('file', blob, `preview-${templateId}.png`);
        const token = localStorage.getItem('accessToken') ?? '';
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
        await fetch(`${apiBase}/templates/${templateId}/preview-image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
        });
    };

    const { data: whatsappSessions = [] } = useQuery({
        queryKey: ['whatsapp-sessions'],
        queryFn: () => api.get('/whatsapp/sessions').then(r => r.data ?? []),
    });

    const { data: mediaList = [] } = useQuery({
        queryKey: ['media'],
        queryFn: () => api.get('/media-gallery').then(r => r.data?.media || []),
    });

    const { data: existingTemplate } = useQuery({
        queryKey: ['templates', existingId],
        queryFn: () => api.get(`/templates/${existingId}`).then(r => r.data),
        enabled: !!existingId,
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
            // ── Capture BEFORE the API call so the DOM is still mounted ──────────
            const previewBlob = await capturePreviewBlob();

            const payload = { ...form, buttons };
            const apiRes = existingId
                ? await api.put(`/templates/${existingId}/versions`, payload)
                : await api.post('/templates', payload);

            return { apiRes, previewBlob };
        },
        onSuccess: ({ apiRes, previewBlob }) => {
            const templateId = existingId ?? apiRes.data?.id;
            if (templateId && previewBlob) {
                // Fire-and-forget — blob is already in memory, navigation won't affect it
                uploadPreviewBlob(templateId, previewBlob).catch(e =>
                    console.warn('[preview-capture] upload failed:', e)
                );
            }
            qc.invalidateQueries({ queryKey: ['templates'] });
            router.push('/templates');
        },
        onError: (err: any) => {
            alert(err.response?.data?.message || 'Error saving template');
        },
    });

    const testMutation = useMutation({
        mutationFn: async () => {
            if (!existingId) throw new Error('Save the template first before testing');
            return api.post(`/templates/${existingId}/test`, {
                sessionId: testSessionId,
                phoneNumber: testPhoneNumber,
                variables: previewVars,
            });
        },
        onSuccess: () => alert('Test message enqueued successfully!'),
        onError: (err: any) => alert(err.response?.data?.message || 'Error sending test message'),
    });

    const generateAiMutation = useMutation({
        mutationFn: (promptText: string) => api.post('/ai/generate-template', { prompt: promptText }),
        onSuccess: (res) => {
            if (res.data?.text) {
                setForm(prev => ({ ...prev, messageText: res.data.text }));
                setAiPrompt('');
            }
        },
        onError: (err: any) => {
            alert(err.response?.data?.message || 'Error generating text');
        }
    });

    useEffect(() => {
        const matches = [...form.messageText.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
        const newVars: Record<string, string> = { ...previewVars };
        matches.forEach(m => { if (!(m in newVars)) newVars[m] = `{${m}}`; });
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
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
    const mediaUrl = selectedMedia ? `${apiBase}/media-gallery/${selectedMedia.id}/file?token=${token}` : null;

    const canSave = !saveMutation.isPending && !!form.name && !!form.messageText;

    return (
        <div className="flex flex-col h-full bg-base">

            {/* ── Top Bar ── */}
            <div className="shrink-0 flex items-center gap-4 px-6 h-14 border-b border-[rgba(255,255,255,0.06)] z-20 bg-surface">
                <Link href="/templates" className="interactive-press p-1.5 rounded-md text-muted hover:text-white hover:bg-hover transition-colors">
                    <ChevronLeft size={18} />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-[14px] font-bold text-white tracking-tight truncate">
                        {existingId ? 'Edit Template' : 'Create Template'}
                    </h1>
                    <p className="text-[11px] text-muted leading-none mt-0.5">
                        {existingId ? 'Saving creates a new immutable version' : 'Design a reusable outbound message'}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => router.push('/templates')}
                        className="interactive-press px-3 py-1.5 rounded-md text-[13px] font-medium text-muted hover:text-white hover:bg-hover border border-[rgba(255,255,255,0.06)] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => saveMutation.mutate()}
                        disabled={!canSave}
                        className="interactive-press flex items-center gap-2 px-4 py-1.5 rounded-md text-[13px] font-semibold bg-accent hover:bg-accent-hover text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                        <Save size={13} />
                        {saveMutation.isPending ? 'Saving…' : 'Save Template'}
                    </button>
                </div>
            </div>

            {/* ── Two-panel layout ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* LEFT: Form — scrollable */}
                <div className="flex-1 overflow-y-auto border-r border-[rgba(255,255,255,0.05)]">
                    <div className="max-w-2xl mx-auto px-8 py-8 flex flex-col gap-8">

                        {/* Basic Settings */}
                        <Section title="Basic Settings">
                            <div>
                                <Label>Template Name</Label>
                                <FormInput
                                    placeholder="e.g. welcome_offer_01"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                                    disabled={!!existingId}
                                />
                                {existingId
                                    ? <p className="text-[11px] text-muted mt-1.5">Name is immutable for existing templates.</p>
                                    : <p className="text-[11px] text-muted mt-1.5">Lowercase, letters/numbers/underscores only.</p>
                                }
                            </div>
                        </Section>

                        <Divider />

                        {/* Header Media */}
                        <Section title="Header Media" action={<span className="text-[11px] text-muted">Optional</span>}>
                            <div>
                                <Label>Attached Media</Label>
                                <FormSelect
                                    title="Select Header Media"
                                    value={form.headerMediaId}
                                    onChange={e => setForm({ ...form, headerMediaId: e.target.value })}
                                >
                                    <option value="">No Media Attached</option>
                                    {mediaList.map((m: any) => (
                                        <option key={m.id} value={m.id}>{m.name} ({m.type.toUpperCase()})</option>
                                    ))}
                                </FormSelect>
                                {!mediaList.length && (
                                    <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1">
                                        <Info size={11} /> No media available — upload to the Media Gallery first.
                                    </p>
                                )}
                            </div>
                        </Section>

                        <Divider />

                        {/* Message Body */}
                        <Section title="Message Body">
                            {/* AI Assist Box */}
                            <div className="flex flex-col gap-2 p-3 rounded-md border border-[rgba(34,197,94,0.15)] bg-[rgba(34,197,94,0.02)] relative">
                                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-accent uppercase tracking-wider mb-0.5">
                                    <Sparkles size={11} className="text-accent" />
                                    AI Writer Assist
                                </label>
                                <div className="flex gap-2">
                                    <FormInput
                                        placeholder="e.g. Write a festive offer, ending soon..."
                                        value={aiPrompt}
                                        onChange={e => setAiPrompt(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && aiPrompt.trim()) generateAiMutation.mutate(aiPrompt.trim());
                                        }}
                                        disabled={generateAiMutation.isPending}
                                    />
                                    <button
                                        onClick={() => aiPrompt.trim() && generateAiMutation.mutate(aiPrompt.trim())}
                                        disabled={!aiPrompt.trim() || generateAiMutation.isPending}
                                        className="interactive-press shrink-0 px-3 py-2 rounded-md bg-accent text-black font-semibold text-[13px] disabled:opacity-50 transition-colors flex items-center justify-center min-w-[80px]"
                                    >
                                        {generateAiMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Generate'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <Label>Body Text</Label>
                                <div className="rounded-md border border-[rgba(255,255,255,0.06)] focus-within:border-[rgba(34,197,94,0.4)] focus-within:ring-1 focus-within:ring-[rgba(34,197,94,0.15)] transition-all duration-[120ms] overflow-hidden bg-[#111111]">
                                    <textarea
                                        className="w-full px-3 py-2.5 bg-transparent resize-none min-h-[140px] outline-none text-[13px] text-white placeholder:text-white/20 leading-relaxed"
                                        placeholder={"Hello {{contact.name}}, check out our new..."}
                                        value={form.messageText}
                                        onChange={e => setForm({ ...form, messageText: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Variables guide */}
                            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)]">
                                <HelpCircle size={13} className="text-muted shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-[11px] font-semibold text-white/50 mb-0.5">Variable Syntax</p>
                                    <p className="text-[11px] text-muted leading-relaxed">
                                        Use <code className="px-1 py-0.5 rounded text-[10px] font-mono text-accent bg-[rgba(34,197,94,0.08)]">{`{{namespace.field}}`}</code> — namespaces: <span className="text-white/50">contact, conversation, workspace, event</span>
                                    </p>
                                </div>
                            </div>

                            {/* Variable simulators */}
                            {Object.keys(previewVars).length > 0 && (
                                <div className="flex flex-col gap-2 p-3 rounded-md border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)]">
                                    <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Simulate Variables</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(previewVars).map(([key, value]) => (
                                            <div key={key}>
                                                <Label>{key}</Label>
                                                <FormInput
                                                    title={`Simulate ${key}`}
                                                    value={value}
                                                    onChange={e => setPreviewVars({ ...previewVars, [key]: e.target.value })}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Section>

                        <Divider />

                        {/* Footer */}
                        <Section title="Footer" action={<span className="text-[11px] text-muted">Optional</span>}>
                            <div>
                                <Label>Footer Text</Label>
                                <FormInput
                                    placeholder="e.g. Reply STOP to opt out"
                                    value={form.footerText}
                                    onChange={e => setForm({ ...form, footerText: e.target.value })}
                                    maxLength={60}
                                />
                                <p className="text-[11px] text-muted mt-1.5">{form.footerText.length}/60 characters</p>
                            </div>
                        </Section>

                        <Divider />

                        {/* Buttons */}
                        <Section
                            title="Interactive Buttons"
                            action={
                                <button
                                    onClick={() => {
                                        if (buttons.length >= 3) return alert('Max 3 buttons allowed');
                                        setButtons([...buttons, { type: 'quick_reply', label: 'New Button', payload: '' }]);
                                    }}
                                    className="interactive-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-semibold text-accent border border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.04)] hover:bg-[rgba(34,197,94,0.08)] transition-colors"
                                >
                                    <Plus size={12} /> Add Button
                                </button>
                            }
                        >
                            {buttons.length === 0 ? (
                                <div className="flex items-center gap-2 px-3 py-3 rounded-md border border-dashed border-[rgba(255,255,255,0.06)] text-[12px] text-muted">
                                    <Zap size={13} className="text-muted/50" />
                                    No buttons yet — add quick replies, URL links, or phone call triggers.
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {buttons.map((btn, idx) => (
                                        <div key={idx} className="flex flex-col gap-2 p-3 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#111111]">
                                            <div className="flex gap-2 items-center">
                                                <FormSelect
                                                    title="Button type"
                                                    className="!w-[140px] shrink-0"
                                                    value={btn.type}
                                                    onChange={e => {
                                                        const n = [...buttons]; n[idx].type = e.target.value; setButtons(n);
                                                    }}
                                                >
                                                    <option value="quick_reply">Quick Reply</option>
                                                    <option value="url">URL Link</option>
                                                    <option value="call">Phone Call</option>
                                                </FormSelect>
                                                <FormInput
                                                    placeholder="Button label"
                                                    className="flex-1 min-w-0"
                                                    value={btn.label}
                                                    onChange={e => {
                                                        const n = [...buttons]; n[idx].label = e.target.value; setButtons(n);
                                                    }}
                                                    maxLength={25}
                                                />
                                                <button
                                                    title="Remove"
                                                    onClick={() => setButtons(buttons.filter((_, i) => i !== idx))}
                                                    className="interactive-press p-1.5 text-red-400 hover:bg-red-500/10 rounded-md transition-colors shrink-0"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                            {(btn.type === 'url' || btn.type === 'call') && (
                                                <FormInput
                                                    placeholder={btn.type === 'url' ? 'https://example.com' : '+1234567890'}
                                                    value={btn.payload || ''}
                                                    onChange={e => {
                                                        const n = [...buttons]; n[idx].payload = e.target.value; setButtons(n);
                                                    }}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>

                        {/* Bottom padding */}
                        <div className="h-4" />
                    </div>
                </div>

                {/* RIGHT: Preview — scrollable */}
                <div className="w-[380px] shrink-0 overflow-y-auto bg-surface">
                    <div className="p-6 flex flex-col gap-5">

                        {/* Panel title */}
                        <div className="flex items-center gap-2">
                            <Smartphone size={15} className="text-muted" />
                            <span className="text-[13px] font-bold text-white/80 tracking-tight">Live Preview</span>
                        </div>

                        {/* ── WA device mock — ref used by html2canvas for preview capture ── */}
                        <div ref={previewRef} className="rounded-2xl overflow-hidden border border-[rgba(255,255,255,0.06)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                            {/* WA App bar */}
                            <div className="h-12 flex items-center px-4 gap-3 bg-[#00A884]">
                                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-[11px]">
                                    {(form.name || 'B').charAt(0).toUpperCase()}
                                </div>
                                <span className="text-white font-semibold text-[13px] truncate">{form.name || 'Your Brand'}</span>
                            </div>

                            {/* Chat area */}
                            <div className="p-3 min-h-[240px] bg-[#0B1418]">
                                {/* Dot pattern */}
                                <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(circle,#fff_1px,transparent_1px)] bg-[size:18px_18px]" />

                                <div className="max-w-[88%] relative">
                                    {/* Message bubble */}
                                    <div className="rounded-[4px_12px_12px_12px] overflow-hidden bg-[#1F2C34]">
                                        {/* Media */}
                                        {selectedMedia && mediaUrl && (
                                            <>
                                                {selectedMedia.type === 'video' && (
                                                    <div className="w-full h-32 bg-black/50 overflow-hidden relative flex items-center justify-center">
                                                        <video src={mediaUrl} preload="metadata" className="w-full h-full object-cover opacity-70" />
                                                        <div className="absolute w-9 h-9 bg-black/60 rounded-full flex items-center justify-center">
                                                            <Video size={13} className="text-white" />
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedMedia.type === 'document' && (
                                                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
                                                        <div className="w-8 h-9 bg-red-500/20 rounded flex items-center justify-center shrink-0">
                                                            <FileText size={13} className="text-red-400" />
                                                        </div>
                                                        <span className="text-[11px] text-white/60 truncate">{selectedMedia.name || 'Document'}</span>
                                                    </div>
                                                )}
                                                {selectedMedia.type !== 'video' && selectedMedia.type !== 'document' && (
                                                    <div className="w-full h-32 overflow-hidden">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {!selectedMedia && form.headerMediaId && (
                                            <div className="w-full h-24 flex items-center justify-center border-b border-white/5 bg-[rgba(255,255,255,0.03)]">
                                                <ImageIcon size={18} className="text-white/15" />
                                            </div>
                                        )}

                                        {/* Body text */}
                                        <div className="px-3 py-2.5">
                                            <p className="text-[12px] text-white/85 whitespace-pre-wrap leading-relaxed">
                                                {renderPreviewText() || <span className="text-white/25 italic">Message goes here...</span>}
                                            </p>
                                            {form.footerText && (
                                                <p className="text-[10px] text-white/30 mt-1.5">{form.footerText}</p>
                                            )}
                                            <div className="flex justify-end mt-1.5">
                                                <span className="text-[9px] text-white/25">12:00 ✓✓</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Buttons */}
                                    {buttons.length > 0 && (
                                        <div className="flex flex-col gap-0.5 mt-1">
                                            {buttons.map((b, i) => (
                                                <div key={i} className="rounded-xl py-1.5 px-3 text-center text-[11px] text-[#00D87C] font-medium flex items-center justify-center gap-1 shadow-sm bg-[#1F2C34]">
                                                    {b.type === 'url' ? <ArrowUpRight size={10} /> : b.type === 'call' ? <Phone size={10} /> : null}
                                                    {b.label || 'Action'}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── Send Test ── */}
                        <div className="rounded-xl border border-[rgba(255,255,255,0.06)] overflow-hidden bg-[#111111]">
                            <div className="px-4 pt-3 pb-2 border-b border-[rgba(255,255,255,0.04)]">
                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Send Test Message</p>
                            </div>
                            <div className="px-4 py-4 flex flex-col gap-3">
                                <div>
                                    <Label>WhatsApp Session</Label>
                                    <FormSelect
                                        title="Select session"
                                        value={testSessionId}
                                        onChange={e => setTestSessionId(e.target.value)}
                                    >
                                        <option value="">Select a connected session</option>
                                        {(whatsappSessions as any[]).filter(s => s.status === 'CONNECTED').map((s: any) => (
                                            <option key={s.sessionId} value={s.sessionId}>{s.name} ({s.phoneNumber || s.sessionId})</option>
                                        ))}
                                    </FormSelect>
                                </div>
                                <div>
                                    <Label>Recipient Number</Label>
                                    <FormInput
                                        placeholder="+1234567890"
                                        value={testPhoneNumber}
                                        onChange={e => setTestPhoneNumber(e.target.value)}
                                    />
                                </div>
                                <button
                                    className="interactive-press w-full py-2 rounded-md text-[13px] font-semibold bg-accent hover:bg-accent-hover text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-1"
                                    disabled={!existingId || !testSessionId || !testPhoneNumber || testMutation.isPending}
                                    onClick={() => testMutation.mutate()}
                                >
                                    {testMutation.isPending ? 'Sending…' : 'Send Test'}
                                </button>
                                {!existingId && (
                                    <p className="text-[11px] text-amber-400 flex items-center gap-1">
                                        <Info size={11} /> Save the template first before testing.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="h-2" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function TemplateBuilderPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-muted">Loading builder…</div>}>
            <TemplateBuilder />
        </Suspense>
    );
}
