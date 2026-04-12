'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAudiences } from '@/hooks/useAudiences';
import { useLeadGenerationLists, useLeadGenerationDetail } from '@/hooks/useLeadGeneration';
import QRCode from 'react-qr-code';
import {
    ArrowLeft, Check, ChevronDown, Plus, Image as ImageIcon,
    Pencil, Save, Shield, Zap, Users, MapPin, UserPlus, X,
    Loader2, Send, Phone, Clock, AlertTriangle, Smartphone,
    HelpCircle, Trash2, ArrowUpRight, Users2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WhatsAppSession {
    id: string;
    sessionId: string;
    name: string;
    phoneNumber?: string | null;
    status: 'connected' | 'offline' | 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'NEEDS_SCAN' | 'QR_PENDING';
    qrCode?: string;
}

function mapSession(raw: any): WhatsAppSession {
    return { ...raw, status: raw.status === 'QR_PENDING' ? 'NEEDS_SCAN' : raw.status };
}

// ─── Add Session Modal ────────────────────────────────────────────────────────

function AddSessionModal({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: (session: WhatsAppSession) => void;
}) {
    const qc = useQueryClient();
    const [name, setName] = useState('');

    const createMutation = useMutation({
        mutationFn: (n: string) =>
            api.post('/whatsapp/sessions', { name: n }).then(r => mapSession(r.data)),
        onSuccess: (session) => {
            api.post(`/whatsapp/sessions/${session.sessionId}/connect`).catch(() => {});
            qc.invalidateQueries({ queryKey: ['whatsappSessions'] });
            onCreated(session);
            onClose();
        },
        onError: (e: any) => {
            alert(e.response?.data?.error?.message || e.response?.data?.message || 'Failed to create session');
        },
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="nc-modal-box">
                <button
                    title="Close"
                    aria-label="Close dialog"
                    onClick={onClose}
                    className="nc-modal-close-btn"
                >
                    <X size={18} />
                </button>

                <div>
                    <div className="nc-modal-header">
                        <div className="nc-modal-icon">
                            <Smartphone size={18} />
                        </div>
                        <h3 className="nc-modal-title">Add WhatsApp Account</h3>
                    </div>
                    <p className="nc-modal-sub">Give this account a label to identify it later.</p>
                </div>

                <div className="nc-modal-field">
                    <label className="nc-modal-field-label">Account Label</label>
                    <input
                        className="input"
                        placeholder="e.g. Sales North, Support, CEO"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && name.trim() && createMutation.mutate(name.trim())}
                        autoFocus
                    />
                </div>

                <button
                    className="btn btn-primary nc-modal-submit"
                    disabled={!name.trim() || createMutation.isPending}
                    onClick={() => createMutation.mutate(name.trim())}
                >
                    {createMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : 'Continue →'}
                </button>
            </div>
        </div>
    );
}

// ─── QR Code Modal ────────────────────────────────────────────────────────────

function QRModal({ session, onClose }: { session: WhatsAppSession; onClose: () => void }) {
    const qc = useQueryClient();

    const { data: live } = useQuery<WhatsAppSession>({
        queryKey: ['wa-session-status', session.sessionId],
        queryFn: () => api.get(`/whatsapp/sessions/${session.sessionId}/status`).then(r => mapSession(r.data)),
        refetchInterval: 2500,
    });

    const current = live ?? session;

    useEffect(() => {
        if (current.status === 'CONNECTED') {
            qc.invalidateQueries({ queryKey: ['whatsappSessions'] });
            onClose();
        }
    }, [current.status, qc, onClose]);

    if (current.status === 'CONNECTED') return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="nc-modal-box nc-modal-box--center">
                <button
                    title="Close"
                    aria-label="Close dialog"
                    onClick={onClose}
                    className="nc-modal-close-btn"
                >
                    <X size={18} />
                </button>

                <div>
                    <h3 className="nc-qr-title">
                        Connect <span className="nc-qr-title-accent">{current.name}</span>
                    </h3>
                    <p className="nc-qr-sub">Scan with WhatsApp to link this device</p>
                </div>

                {(current.status === 'DISCONNECTED' || current.status === 'CONNECTING') && (
                    <div className="nc-qr-connecting">
                        <Loader2 size={40} className="animate-spin nc-qr-connecting-icon" />
                        <p className="nc-qr-connecting-text">
                            {current.status === 'DISCONNECTED' ? 'Starting connection…' : 'Connecting to WhatsApp servers…'}
                        </p>
                    </div>
                )}

                {current.status === 'NEEDS_SCAN' && current.qrCode && (
                    <>
                        <ol className="nc-qr-steps">
                            <li>Open WhatsApp → tap <strong>Menu</strong> / <strong>Settings</strong></li>
                            <li>Tap <strong>Linked Devices</strong> → <strong>Link a Device</strong></li>
                            <li>Scan the QR code below</li>
                        </ol>
                        <div className="nc-qr-code-wrap">
                            <QRCode value={current.qrCode} size={200} />
                        </div>
                        <div className="nc-qr-waiting">
                            <Loader2 size={13} className="animate-spin" /> Waiting for scan…
                        </div>
                    </>
                )}

                {current.status === 'NEEDS_SCAN' && !current.qrCode && (
                    <div className="nc-qr-gen">
                        <Loader2 size={32} className="animate-spin nc-qr-gen-icon" />
                        <p className="nc-qr-gen-text">Generating QR code…</p>
                    </div>
                )}
            </div>
        </div>
    );
}

interface MessageTemplate {
    id: string;
    name: string;
    body: string;
    mediaUrl?: string;
    headerMediaId?: string;
    buttons?: ComposeButton[];
    buttonText?: string;
    footerText?: string;
    previewImageUrl?: string;
}

interface ManualContact {
    id: string;
    name: string;
    phone: string;
}

// MapAudienceContact was used for placeholders, removed.

interface ComposeButton {
    type: 'quick_reply' | 'url' | 'call';
    label: string;
    payload: string;
}

interface CampaignDraft {
    name: string;
    whatsappSessionId: string | null;
    message: {
        text: string;
        headerMediaId?: string;      // gallery media ID
        mediaUrl?: string;           // local blob URL (file upload)
        buttons: ComposeButton[];    // up to 3 interactive buttons
        footerText?: string;
        templateId?: string;
    };
    audience: {
        mode: 'list' | 'manual' | 'maps';
        listId?: string;
        manualContacts?: ManualContact[];
        mapSelectedPlaces?: string[];
    };
}

// ─── Readiness Computation ────────────────────────────────────────────────────

function useReadiness(
    draft: CampaignDraft,
    sessions: WhatsAppSession[],
    selectedAudience: any,
    manualContacts: ManualContact[]
) {
    const sessionReady = (() => {
        if (!draft.whatsappSessionId) return false;
        const s = sessions.find(s => s.id === draft.whatsappSessionId);
        return s?.status === 'connected' || s?.status === 'CONNECTED';
    })();
    const messageReady = draft.message.text.trim().length > 0;
    const audienceReady = (() => {
        if (draft.audience.mode === 'list') return !!draft.audience.listId && (selectedAudience?.memberCount ?? 0) > 0;
        if (draft.audience.mode === 'manual') return manualContacts.length > 0;
        if (draft.audience.mode === 'maps') return false; // Handled directly via audience creation now
        return false;
    })();
    return { sessionReady, messageReady, audienceReady, allReady: sessionReady && messageReady && audienceReady };
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function ReadinessSteps({ sessionReady, messageReady, audienceReady, allReady }: {
    sessionReady: boolean; messageReady: boolean; audienceReady: boolean; allReady: boolean;
}) {
    const steps = [
        { label: 'Session', done: sessionReady },
        { label: 'Message', done: messageReady },
        { label: 'Audience', done: audienceReady },
    ];
    return (
        <div className="nc-readiness">
            <div className="nc-readiness-steps">
                {steps.map((s, i) => (
                    <div key={s.label} className="nc-readiness-step-wrap">
                        <div className={`nc-readiness-step ${s.done ? 'nc-readiness-step--done' : ''}`}>
                            {s.done ? <Check size={12} /> : <span>{i + 1}</span>}
                            <span>{s.label}</span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={`nc-readiness-line ${s.done ? 'nc-readiness-line--done' : ''}`} />
                        )}
                    </div>
                ))}
            </div>
            <div className={`nc-readiness-chip ${allReady ? 'nc-readiness-chip--ready' : ''}`}>
                {allReady ? <><Zap size={11} /> Ready to launch</> : <><Clock size={11} /> In progress</>}
            </div>
        </div>
    );
}

function PhoneSimulator({ draft, recipientCount, sessionName, mediaList = [], previewRef }: {
    draft: CampaignDraft; recipientCount: number; sessionName: string; mediaList?: any[]; previewRef?: React.RefObject<HTMLDivElement>;
}) {
    const displayName = draft.audience.mode === 'list' ? (sessionName || 'WhatsApp Campaign') : `${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}`;

    // Resolve media
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
    const dbMedia = mediaList.find((m: any) => m.id === draft.message.headerMediaId);
    let resolvedUrl = draft.message.mediaUrl;
    if (!resolvedUrl && draft.message.headerMediaId) {
        resolvedUrl = `${apiBase}/media-gallery/${draft.message.headerMediaId}/file?token=${token}`;
    }
    const mediaType = dbMedia?.type || (resolvedUrl?.includes('.mp4') ? 'video' : 'image');

    return (
        <div ref={previewRef} className="w-full max-w-[340px] mt-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)] shrink-0">
            <div className="rounded-[1.2rem] overflow-hidden border border-[rgba(255,255,255,0.06)] bg-[#0B1418] relative flex flex-col">
                {/* WA App bar */}
                <div className="h-[52px] flex items-center px-3.5 gap-3 bg-[#00A884] z-10 relative">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-[12px] shrink-0">
                        {(displayName || 'C').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white font-semibold text-[14px] truncate">{displayName || 'Campaign Contacts'}</span>
                </div>

                {/* Chat area */}
                <div className="p-3.5 min-h-[260px] bg-[#0B1418] relative flex flex-col justify-end">
                    {/* Dot pattern */}
                    <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(circle,#fff_1px,transparent_1px)] bg-[size:18px_18px]" />

                    <div className="max-w-[88%] relative z-10 w-full mb-1">
                        {/* Message bubble */}
                        <div className="rounded-[4px_12px_12px_12px] overflow-hidden bg-[#1F2C34] shadow-[0_1px_1.5px_rgba(0,0,0,0.3)]">
                            {/* Media */}
                            {resolvedUrl && (
                                <>
                                    {mediaType === 'video' && (
                                        <div className="w-full h-[140px] bg-black/50 overflow-hidden relative flex items-center justify-center">
                                            <video src={resolvedUrl} preload="metadata" className="w-full h-full object-cover opacity-70" />
                                            <div className="absolute w-10 h-10 bg-black/60 rounded-full flex items-center justify-center pl-1">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                            </div>
                                        </div>
                                    )}
                                    {mediaType === 'document' && (
                                        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]">
                                            <div className="w-8 h-9 bg-red-500/20 rounded flex items-center justify-center shrink-0">
                                                <span className="text-red-400 font-bold tracking-tighter text-[9px]">DOC</span>
                                            </div>
                                            <span className="text-[11px] text-[rgba(255,255,255,0.6)] truncate">{dbMedia?.name || 'Document'}</span>
                                        </div>
                                    )}
                                    {mediaType !== 'video' && mediaType !== 'document' && (
                                        <div className="w-full h-[140px] overflow-hidden relative">
                                            <img src={resolvedUrl} alt="" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </>
                            )}
                            {!resolvedUrl && draft.message.headerMediaId && (
                                <div className="w-full h-[100px] flex flex-col items-center justify-center border-b border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)]">
                                    <ImageIcon size={22} className="text-white/20 mb-2" />
                                    <span className="text-[10px] text-white/30 uppercase tracking-[0.08em] font-semibold">Media Attached</span>
                                </div>
                            )}

                            {/* Body text */}
                            <div className="px-3 pt-2 pb-2.5 relative">
                                <p className="text-[13px] text-[rgba(241,241,242,0.92)] whitespace-pre-wrap leading-[1.42] selection:bg-accent/20">
                                    {draft.message.text || <span className="text-white/25 italic">Message preview...</span>}
                                </p>
                                {draft.message.footerText && (
                                    <p className="text-[11px] text-[rgba(241,241,242,0.45)] mt-1.5 leading-snug">{draft.message.footerText}</p>
                                )}
                                <div className="flex justify-end mt-1 mb-[2px] opacity-70">
                                    <span className="text-[10px] text-[rgba(241,241,242,0.6)] flex items-center gap-1">12:00 <span className="text-[#53bdeb] tracking-[-2px] text-[11px]">✓✓</span></span>
                                </div>
                            </div>
                        </div>

                        {/* Buttons */}
                        {(draft.message.buttons ?? []).length > 0 && (
                            <div className="flex flex-col gap-[2px] mt-[2px]">
                                {(draft.message.buttons ?? []).map((b, i) => (
                                    <div key={i} className="rounded-xl py-[8px] px-3 text-center text-[12px] text-[#53bdeb] font-medium flex items-center justify-center gap-1.5 shadow-[0_1px_1.5px_rgba(0,0,0,0.3)] bg-[#1F2C34]">
                                        {b.type === 'url' ? <ArrowUpRight size={12} strokeWidth={2.5} /> : b.type === 'call' ? <Phone size={12} strokeWidth={2.5} /> : null}
                                        <span className="truncate">{b.label || 'Action'}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewCampaignPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get('id'); // present when editing an existing draft
    const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Global draft state ──
    const [campaignName, setCampaignName] = useState('New Campaign');
    const [isEditingName, setIsEditingName] = useState(false);
    const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
    const [draftSaved, setDraftSaved] = useState(false);
    const [isLoadingEdit, setIsLoadingEdit] = useState(!!editId);
    const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null); // templateId to apply once templates load
    const nameInputRef = useRef<HTMLInputElement>(null);

    const [draft, setDraft] = useState<CampaignDraft>({
        name: 'New Campaign',
        whatsappSessionId: null,
        message: { text: '', buttons: [], footerText: '', mediaUrl: undefined },
        audience: { mode: 'list', listId: undefined },
    });

    // ── Load existing draft when ?id= is present ──
    useEffect(() => {
        if (!editId) return;
        setSavedCampaignId(editId);
        api.get(`/campaigns/${editId}`).then(res => {
            const c = res.data;
            setCampaignName(c.name || 'Draft Campaign');
            setDraft(d => ({
                ...d,
                name: c.name || 'Draft Campaign',
                whatsappSessionId: c.whatsappAccountId ?? null,
                message: {
                    text: c.messageText || '',
                    buttons: [],
                    footerText: '',
                    templateId: c.templateId ?? undefined,
                },
                audience: {
                    mode: 'list',
                    listId: c.audienceId ?? undefined,
                },
            }));
            if (c.messageText) {
                setIsComposeMode(true);
                setComposeText(c.messageText);
            } else if (c.templateId) {
                // Templates may not be loaded yet — store for deferred apply
                setPendingTemplateId(c.templateId);
                setActiveTemplateId(c.templateId);
            }
            if (c.audienceId) {
                setAudienceMode('list');
            }
        }).catch(console.error).finally(() => setIsLoadingEdit(false));
    }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── UI state ──
    const [intelExpanded, setIntelExpanded] = useState(false);
    const [audienceMode, setAudienceMode] = useState<'list' | 'manual' | 'maps'>('list');
    const [isComposeMode, setIsComposeMode] = useState(false);
    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

    // ── Audience state ──
    const [manualContacts, setManualContacts] = useState<ManualContact[]>([]);
    const [manualForm, setManualForm] = useState({ name: '', phone: '', countryCode: '+91' });
    const [leadKeyword, setLeadKeyword] = useState('');
    const [leadLocation, setLeadLocation] = useState('');
    const [inlineLeadListId, setInlineLeadListId] = useState<string | null>(null);
    const { generateLeads, isGenerating: isGeneratingLeads } = useLeadGenerationLists();
    const { list: leadListDetail, convertLeads, isConverting: isConvertingLeads } = useLeadGenerationDetail(inlineLeadListId ?? '');

    // ── Session dropdown ──
    const [sessionOpen, setSessionOpen] = useState(false);
    const [showAddSession, setShowAddSession] = useState(false);
    const [qrSession, setQrSession] = useState<WhatsAppSession | null>(null);

    // ── Compose form state (syncs live to draft.message) ──
    const [composeText, setComposeText] = useState('');
    const [composeButtons, setComposeButtons] = useState<ComposeButton[]>([]);
    const [composeFooter, setComposeFooter] = useState('');
    const [composeMediaId, setComposeMediaId] = useState('');   // gallery pick
    const [composeMedia, setComposeMedia] = useState<string | undefined>();  // file blob URL
    const [composeVars, setComposeVars] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Data queries ──
    const { data: sessions = [] } = useQuery<WhatsAppSession[]>({
        queryKey: ['whatsappSessions'],
        queryFn: () => api.get('/whatsapp/sessions').then(r => (Array.isArray(r.data) ? r.data : []).map(mapSession)),
        refetchInterval: 5000,
    });

    const { data: templates = [] } = useQuery<MessageTemplate[]>({
        queryKey: ['templates'],
        queryFn: () => api.get('/templates').then(r => {
            const list: any[] = r.data.templates || r.data || [];
            return list.map((t: any) => {
                const latest = t.versions?.[0] || {};
                return {
                    id: t.id,
                    name: t.name,
                    body: t.body ?? latest.messageText ?? '',
                    mediaUrl: t.mediaUrl, // Local uploads mapping
                    headerMediaId: latest.headerMediaId,
                    buttonText: t.buttonText ?? '',
                    buttons: latest.buttons ?? [],
                    footerText: t.footerText ?? latest.footerText ?? '',
                    previewImageUrl: t.previewImageUrl ?? undefined,
                };
            });
        }),
    });

    // ── When editing a draft with a templateId: apply the template once templates load ──
    // (applyTemplate is defined later via useCallback, so we forward-ref it)
    const applyTemplateRef = useRef<((t: MessageTemplate) => void) | null>(null);
    useEffect(() => {
        if (!pendingTemplateId || templates.length === 0) return;
        const match = templates.find(t => t.id === pendingTemplateId);
        if (match && applyTemplateRef.current) {
            setPendingTemplateId(null); // consume so we don't re-apply
            applyTemplateRef.current(match);
        }
    }, [templates, pendingTemplateId]);

    const { audiences, refresh: refreshAudiences } = useAudiences();

    // ── Derived values ──
    const selectedSession = sessions.find(s => s.id === draft.whatsappSessionId) ?? null;
    const selectedAudience = audiences.find(a => a.id === draft.audience.listId) ?? null;

    const recipientCount = (() => {
        if (audienceMode === 'list') return selectedAudience?.memberCount ?? 0;
        if (audienceMode === 'manual') return manualContacts.length;
        if (audienceMode === 'maps') return 0;
        return 0;
    })();

    const { sessionReady, messageReady, audienceReady, allReady } = useReadiness(
        { ...draft, audience: { ...draft.audience, mode: audienceMode } },
        sessions,
        selectedAudience,
        manualContacts
    );

    // ── Create mutation ──
    const qc = useQueryClient();
    const createMutation = useMutation({
        mutationFn: (payload: any) => api.post('/campaigns', payload),
        onSuccess: (res) => {
            const id = res.data?.id;
            if (id) api.post(`/campaigns/${id}/start`, {}).catch(console.error);
            router.push('/campaigns');
        },
    });

    // ── Save Draft Mutation (create or update — never starts the campaign) ──
    const saveDraftMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                name: campaignName,
                templateId: draft.message.templateId,
                messageText: !draft.message.templateId ? (draft.message as any).rawText || draft.message.text : undefined,
                audienceId: audienceMode === 'list' ? draft.audience.listId : undefined,
                whatsappAccountId: draft.whatsappSessionId || undefined,
                status: 'DRAFT',
            };
            if (savedCampaignId) {
                return api.patch(`/campaigns/${savedCampaignId}`, payload);
            } else {
                return api.post('/campaigns', payload);
            }
        },
        onSuccess: (res) => {
            const id = res.data?.id ?? savedCampaignId;
            if (id && !savedCampaignId) setSavedCampaignId(id);
            localStorage.setItem('nc_draft', JSON.stringify({ ...draft, name: campaignName, _savedId: id }));
            qc.invalidateQueries({ queryKey: ['campaigns'] });
            setDraftSaved(true);
            setTimeout(() => setDraftSaved(false), 2000);
        },
        onError: (err: any) => {
            alert(err.response?.data?.message || 'Failed to save draft. Please try again.');
        },
    });

    // ── Save Template Mutation ──
    const [templateName, setTemplateName] = useState('');
    const previewRef = useRef<HTMLDivElement>(null);

    const substituteVideos = async (container: HTMLElement): Promise<() => void> => {
        const restores: Array<() => void> = [];
        const videos = Array.from(container.querySelectorAll<HTMLVideoElement>('video'));

        for (const video of videos) {
            const w = video.offsetWidth || 280;
            const h = video.offsetHeight || 128;

            let frameDataUrl: string | null = null;
            try {
                const resp = await fetch(video.src);
                if (resp.ok) {
                    const blob = await resp.blob();
                    const blobUrl = URL.createObjectURL(blob);
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
                        setTimeout(() => finish(null), 6000);
                        tmp.load();
                        tmp.addEventListener('loadedmetadata', () => { tmp.currentTime = 0.5; });
                    });
                }
            } catch { /* ignored */ }

            const stub = document.createElement('canvas');
            stub.width = w * 2;
            stub.height = h * 2;
            stub.style.cssText = `display:block;width:${w}px;height:${h}px;`;

            const ctx = stub.getContext('2d');
            if (ctx) {
                ctx.scale(2, 2);
                if (frameDataUrl) {
                    const img = new Image();
                    await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); img.src = frameDataUrl!; });
                    ctx.drawImage(img, 0, 0, w, h);
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(0, 0, w, h);
                } else {
                    ctx.fillStyle = '#000d15';
                    ctx.fillRect(0, 0, w, h);
                }
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.beginPath();
                ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2);
                ctx.fill();
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

    const capturePreviewBlob = async (): Promise<Blob | null> => {
        if (!previewRef.current) return null;
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
            restore();
        }
    };

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

    const saveTemplateMutation = useMutation({
        mutationFn: async () => {
            const previewBlob = await capturePreviewBlob();

            const payload = {
                name: templateName,
                category: 'MARKETING',
                language: 'en_US',
                messageText: composeText,
                footerText: composeFooter,
                headerMediaId: composeMediaId || undefined,
                buttons: composeButtons,
            };
            const res = await api.post('/templates', payload);
            const apiRes = res.data?.data || res.data;
            const templateId = apiRes?.id;

            let finalPreviewUrl: string | undefined;
            if (templateId && previewBlob) {
                try {
                    await uploadPreviewBlob(templateId, previewBlob);
                    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
                    finalPreviewUrl = `${apiBase}/templates/${templateId}/preview-image`;
                } catch (e) {
                    console.warn('Preview upload failed', e);
                }
            }

            return { apiRes, finalPreviewUrl };
        },
        onSuccess: ({ apiRes, finalPreviewUrl }) => {
            const newTemplate = apiRes;
            const t: MessageTemplate = {
                id: newTemplate.id,
                name: newTemplate.name,
                body: composeText,
                headerMediaId: composeMediaId || undefined,
                mediaUrl: composeMedia,
                buttons: composeButtons,
                footerText: composeFooter,
                previewImageUrl: finalPreviewUrl,
            };

            // Inject optimistic UI state immediately so grid card has thumbnail instantly
            qc.setQueryData(['templates'], (old: any) => {
                if (!old) return [t];
                return [t, ...old.filter((o: any) => o.id !== t.id)];
            });

            // Revalidate in background
            qc.invalidateQueries({ queryKey: ['templates'] });

            setTemplateName('');
            applyTemplate(t);
        },
        onError: (err: any) => {
            alert(err.response?.data?.message || 'Error saving template');
        }
    });

    // ── Auto-save ──
    useEffect(() => {
        autoSaveRef.current = setInterval(() => {
            localStorage.setItem('nc_draft', JSON.stringify({ ...draft, name: campaignName }));
        }, 10000);
        return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
    }, [draft, campaignName]);

    // ── Sync audience mode to draft ──
    useEffect(() => {
        setDraft(d => ({ ...d, audience: { ...d.audience, mode: audienceMode } }));
    }, [audienceMode]);

    // ── Variable detection (for compose mode) ──
    useEffect(() => {
        if (!isComposeMode) return;
        const matches = [...composeText.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
        setComposeVars(prev => {
            const next: Record<string, string> = {};
            matches.forEach(k => { next[k] = prev[k] ?? `{${k}}`; });
            return next;
        });
    }, [composeText, isComposeMode]);

    // ── Live compose → draft sync ──
    useEffect(() => {
        if (!isComposeMode) return;
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
        const selectedGalleryMedia = (mediaList as any[]).find((m: any) => m.id === composeMediaId);
        const galleryMediaUrl = selectedGalleryMedia
            ? `${apiBase}/media-gallery/${selectedGalleryMedia.id}/file?token=${token}`
            : undefined;
        // Render preview text with simulated variables
        let renderedText = composeText;
        Object.entries(composeVars).forEach(([k, v]) => {
            renderedText = renderedText.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
        });
        setDraft(d => ({
            ...d,
            message: {
                text: renderedText,
                rawText: composeText,
                headerMediaId: composeMediaId || undefined,
                mediaUrl: galleryMediaUrl ?? composeMedia,
                buttons: composeButtons,
                footerText: composeFooter || undefined,
            } as any,
        }));
        setActiveTemplateId(null);
    }, [composeText, composeButtons, composeFooter, composeMediaId, composeMedia, composeVars, isComposeMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch media gallery for the compose picker
    const { data: mediaList = [] } = useQuery({
        queryKey: ['media'],
        queryFn: () => api.get('/media-gallery').then(r => r.data?.media || []),
    });

    // ── Template application ──
    const applyTemplate = useCallback((t: MessageTemplate) => {
        setActiveTemplateId(t.id);
        setIsComposeMode(false);
        setDraft(d => ({
            ...d,
            message: {
                text: t.body,
                buttons: t.buttons && t.buttons.length > 0 ? t.buttons : (t.buttonText ? [{ type: 'quick_reply', label: t.buttonText, payload: '' }] : []),
                footerText: t.footerText ?? '',
                mediaUrl: t.mediaUrl,
                headerMediaId: t.headerMediaId,
                templateId: t.id,
            }
        }));
    }, []);
    // Keep ref always in sync so the deferred apply effect can call it
    applyTemplateRef.current = applyTemplate;

    // ── Manual contact add ──
    const addManualContact = () => {
        if (!manualForm.name.trim() || !manualForm.phone.trim()) return;
        const id = `manual_${Date.now()}`;
        setManualContacts(prev => [...prev, { id, name: manualForm.name, phone: `${manualForm.countryCode}${manualForm.phone}` }]);
        setManualForm(f => ({ ...f, name: '', phone: '' }));
    };

    // ── Lead Generation ──
    const handleGenerateLeads = async () => {
        if (!leadKeyword || !leadLocation) return;
        try {
            const result = await generateLeads({ query: `${leadKeyword} in ${leadLocation}` });
            if (result && result.leadListId) {
                setInlineLeadListId(result.leadListId);
            }
        } catch (e) {
            console.error('Lead gen error', e);
        }
    };

    const handleConvertLeads = async () => {
        try {
            const result = await convertLeads({ skipExisting: true, createAudience: true });
            if ((result as any)?.audienceId) {
                await refreshAudiences();
                setDraft(d => ({ ...d, audience: { mode: 'list', listId: (result as any).audienceId } }));
                setAudienceMode('list');
                setInlineLeadListId(null);
                setLeadKeyword('');
                setLeadLocation('');
            }
        } catch (e) {
            console.error('Convert error', e);
        }
    };

    // ── Launch ──
    const handleLaunch = async () => {
        const payload = {
            name: campaignName,
            templateId: draft.message.templateId,
            messageText: !draft.message.templateId ? (draft.message as any).rawText || draft.message.text : undefined,
            audienceId: audienceMode === 'list' ? draft.audience.listId : undefined,
            contactIds: audienceMode === 'manual' ? manualContacts.map(c => c.id) : [],
            whatsappAccountId: draft.whatsappSessionId || undefined,
            status: 'DRAFT',
        };

        if (savedCampaignId) {
            // Already saved — patch it then start
            await api.patch(`/campaigns/${savedCampaignId}`, payload).catch(console.error);
            localStorage.removeItem('nc_draft');
            await api.post(`/campaigns/${savedCampaignId}/start`, {}).catch(console.error);
            qc.invalidateQueries({ queryKey: ['campaigns'] });
            router.push('/campaigns');
        } else {
            createMutation.mutate(payload);
        }
    };


    return (
        <>
            <style>{`
                /* ── New Campaign Workspace ── */
                .nc-root {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    background: var(--bg-base);
                    overflow: hidden;
                    position: relative;
                }

                /* HEADER */
                .nc-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 0 20px;
                    height: 52px;
                    border-bottom: 1px solid var(--border);
                    background: var(--bg-surface);
                    flex-shrink: 0;
                    z-index: 10;
                }
                .nc-header-back {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: var(--text-muted);
                    font-size: 13px;
                    background: none;
                    border: none;
                    padding: 6px 8px;
                    border-radius: 6px;
                    transition: color 120ms, background 120ms;
                }
                .nc-header-back:hover { color: var(--text-primary); background: var(--bg-hover); }
                .nc-header-name-wrap {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 0;
                }
                .nc-header-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                    letter-spacing: -0.02em;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    cursor: text;
                    padding: 3px 6px;
                    border-radius: 4px;
                    border: 1px solid transparent;
                    transition: border-color 120ms, background 120ms;
                }
                .nc-header-name:hover { border-color: var(--border); background: var(--bg-elevated); }
                .nc-header-name-input {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                    background: var(--bg-elevated);
                    border: 1px solid var(--border-strong);
                    border-radius: 4px;
                    padding: 3px 6px;
                    outline: none;
                    letter-spacing: -0.02em;
                    min-width: 200px;
                }
                .nc-header-actions { display: flex; align-items: center; gap: 8px; }
                .nc-save-btn {
                    display: flex; align-items: center; gap: 5px;
                    padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
                    background: var(--bg-elevated); color: var(--text-secondary);
                    border: 1px solid var(--border);
                    transition: all 120ms;
                }
                .nc-save-btn:hover { border-color: var(--border-strong); color: var(--text-primary); }

                /* WORKSPACE */
                .nc-workspace {
                    flex: 1;
                    display: grid;
                    grid-template-columns: 360px 1fr auto;
                    overflow: hidden;
                }

                /* ── ASSEMBLY PANEL (LEFT) ── */
                .nc-assembly {
                    border-right: 1px solid var(--border);
                    background: var(--bg-surface);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .nc-assembly-inner {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                /* Section labels */
                .nc-section-label {
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: var(--text-muted);
                    margin-bottom: 8px;
                }

                /* Session Selector */
                .nc-session-selector {
                    position: relative;
                }
                .nc-session-trigger {
                    width: 100%; display: flex; align-items: center; gap: 10px;
                    padding: 10px 12px; border-radius: 8px;
                    background: var(--bg-elevated); border: 1px solid var(--border);
                    color: var(--text-primary); font-size: 13px;
                    transition: border-color 150ms, background 150ms;
                    cursor: pointer;
                }
                .nc-session-trigger:hover { border-color: var(--border-strong); }
                .nc-session-trigger.nc-session-open { border-color: var(--border-strong); background: var(--bg-surface); }
                .nc-status-dot {
                    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
                    transition: background 300ms;
                }
                .nc-status-dot--online { background: var(--accent); box-shadow: 0 0 6px var(--accent-glow); animation: pulse-dot 2s ease-in-out infinite; }
                .nc-status-dot--offline { background: var(--text-muted); }
                @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.5} }
                .nc-session-name { flex: 1; text-align: left; font-weight: 500; }
                .nc-session-phone { font-size: 11px; color: var(--text-muted); }
                .nc-session-dropdown {
                    position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
                    background: var(--bg-elevated); border: 1px solid var(--border-strong);
                    border-radius: 8px; overflow: hidden;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    animation: nc-dropdown-in 120ms var(--ease-out);
                }
                @keyframes nc-dropdown-in {
                    from { opacity: 0; transform: translateY(-4px) scale(0.98); }
                    to   { opacity: 1; transform: none; }
                }
                .nc-session-option {
                    display: flex; align-items: center; gap: 10px;
                    padding: 10px 12px; cursor: pointer; font-size: 13px; color: var(--text-secondary);
                    transition: background 100ms, color 100ms;
                    border-bottom: 1px solid var(--border);
                }
                .nc-session-option:last-child { border-bottom: none; }
                .nc-session-option:hover { background: var(--bg-hover); color: var(--text-primary); }
                .nc-session-option.nc-option-active { color: var(--text-primary); background: var(--accent-dim); }
                .nc-no-session-warn {
                    display: flex; align-items: center; gap: 6px;
                    padding: 8px 10px; border-radius: 6px; font-size: 11px;
                    background: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.2);
                    color: var(--warning); margin-top: 6px;
                }

                /* Template Gallery */
                .nc-template-grid-scroll {
                    max-height: 280px; overflow-y: auto; padding-right: 4px;
                }
                .nc-template-grid-scroll::-webkit-scrollbar { width: 4px; }
                .nc-template-grid-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
                .nc-template-grid {
                    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
                }
                .nc-template-card {
                    padding: 10px; border-radius: 7px; text-align: left;
                    background: var(--bg-elevated); border: 1px solid var(--border);
                    cursor: pointer; transition: all 150ms;
                    position: relative; overflow: hidden;
                }
                .nc-template-card:hover { border-color: var(--border-strong); background: var(--bg-hover); }
                .nc-template-thumb-img { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; display: block; }
                .nc-template-card.nc-template-active {
                    border-color: var(--accent);
                    background: var(--accent-dim);
                    box-shadow: 0 0 0 1px var(--accent), inset 0 0 20px rgba(16,185,129,0.04);
                }
                .nc-template-name { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 3px; }
                .nc-template-preview { font-size: 11px; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
                .nc-template-badge { font-size: 10px; font-weight: 500; color: var(--accent); background: var(--accent-dim); border-radius: 3px; padding: 1px 4px; display: inline-block; margin-top: 4px; }
                .nc-template-check {
                    position: absolute; top: 6px; right: 6px;
                    width: 16px; height: 16px; border-radius: 50%;
                    background: var(--accent); display: flex; align-items: center; justify-content: center;
                }
                .nc-compose-toggle {
                    display: flex; align-items: center; gap: 5px;
                    font-size: 12px; font-weight: 500; color: var(--text-secondary);
                    background: none; border: none; padding: 4px 0; transition: color 120ms; margin-top: 4px;
                }
                .nc-compose-toggle:hover { color: var(--accent); }

                /* Compose Builder */
                .nc-compose-builder {
                    background: var(--bg-elevated); border: 1px solid var(--border);
                    border-radius: 8px; padding: 14px;
                    display: flex; flex-direction: column; gap: 12px;
                    animation: nc-compose-in 150ms var(--ease-out);
                }
                @keyframes nc-compose-in {
                    from { opacity: 0; transform: translateY(-6px); }
                    to   { opacity: 1; transform: none; }
                }
                .nc-field-label {
                    font-size: 11px; font-weight: 600; color: var(--text-secondary);
                    display: block; margin-bottom: 4px; letter-spacing: 0.02em;
                }
                .nc-char-count { font-size: 10px; color: var(--text-muted); text-align: right; margin-top: 2px; }
                .nc-media-row { display: flex; align-items: center; gap: 8px; }
                .nc-media-thumb {
                    width: 40px; height: 40px; border-radius: 6px; object-fit: cover;
                    border: 1px solid var(--border);
                }
                .nc-media-placeholder {
                    width: 40px; height: 40px; border-radius: 6px;
                    background: var(--bg-surface); border: 1px dashed var(--border);
                    display: flex; align-items: center; justify-content: center;
                }
                .nc-apply-btn {
                    display: flex; align-items: center; gap: 5px; justify-content: center;
                    padding: 8px; border-radius: 6px; font-size: 12px; font-weight: 600;
                    background: var(--text-primary); color: var(--bg-base);
                    border: none; transition: all 120ms;
                }
                .nc-apply-btn:hover { background: #fff; box-shadow: 0 0 12px rgba(255,255,255,0.1); }
                .nc-field-optional { font-size: 10px; color: var(--text-muted); font-weight: 400; margin-left: 4px; }
                .nc-compose-select { appearance: auto; cursor: pointer; }
                .nc-compose-textarea-wrap { border-radius: 6px; border: 1px solid var(--border); overflow: hidden; background: var(--bg-surface); transition: border-color 120ms; }
                .nc-compose-textarea-wrap:focus-within { border-color: rgba(34,197,94,0.4); }
                .nc-compose-textarea-wrap .input { border: none; border-radius: 0; background: transparent; }
                .nc-compose-media-row { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
                /* Variable hint + sim */
                .nc-var-hint { display: flex; align-items: flex-start; gap: 6px; padding: 7px 9px; border-radius: 6px; border: 1px solid var(--border); background: rgba(255,255,255,0.02); font-size: 10px; color: var(--text-muted); line-height: 1.5; }
                .nc-var-hint-icon { color: var(--text-muted); flex-shrink: 0; margin-top: 1px; }
                .nc-var-code { font-size: 9.5px; padding: 1px 4px; border-radius: 3px; background: rgba(34,197,94,0.08); color: var(--accent); font-family: monospace; }
                .nc-vars-sim { padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); background: rgba(255,255,255,0.02); }
                .nc-vars-sim-label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
                .nc-vars-sim-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                /* Button rows */
                .nc-compose-btn-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
                .nc-compose-add-btn { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--accent); background: rgba(34,197,94,0.07); border: 1px solid rgba(34,197,94,0.2); border-radius: 5px; padding: 3px 8px; transition: all 120ms; }
                .nc-compose-add-btn:hover { background: rgba(34,197,94,0.13); }
                .nc-compose-no-btns { font-size: 11px; color: var(--text-muted); padding: 8px 10px; border: 1px dashed var(--border); border-radius: 6px; }
                .nc-compose-btns-list { display: flex; flex-direction: column; gap: 8px; }
                .nc-compose-btn-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 7px; padding: 8px; }
                .nc-btn-type-sel { width: 108px; flex-shrink: 0; }
                .nc-compose-btn-row .input { flex: 1; min-width: 80px; }
                .nc-btn-payload { width: 100%; flex-basis: 100%; }
                .nc-compose-rm-btn { display: flex; align-items: center; padding: 5px; border-radius: 5px; color: #f87171; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.15); transition: all 120ms; flex-shrink: 0; }
                .nc-compose-rm-btn:hover { background: rgba(239,68,68,0.15); }
                /* Simulator buttons */
                .nc-sim-buttons { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 4px; }
                .nc-sim-button { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 5px; border-radius: 8px; font-size: 10px; font-weight: 500; color: #00D87C; background: #1F2C34; }
                /* Inline Template Save */
                .nc-compose-save-wrap { margin-top: 12px; padding-top: 16px; border-top: 1px dashed var(--border); display: flex; flex-direction: column; gap: 10px; }
                .nc-save-opts { display: flex; flex-direction: column; gap: 4px; }

                /* Audience Tabs */
                .nc-aud-tabs {
                    display: flex; gap: 2px;
                    background: var(--bg-elevated); border: 1px solid var(--border);
                    border-radius: 8px; padding: 3px;
                }
                .nc-aud-tab {
                    flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
                    padding: 6px 8px; border-radius: 5px; font-size: 11px; font-weight: 500;
                    color: var(--text-muted); transition: all 120ms; background: none; border: none;
                }
                .nc-aud-tab:hover { color: var(--text-primary); }
                .nc-aud-tab.nc-aud-tab--active {
                    background: var(--bg-surface); color: var(--text-primary);
                    border: 1px solid var(--border-strong);
                    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                }

                /* Audience Pulse */
                .nc-aud-pulse {
                    background: var(--bg-elevated); border: 1px solid var(--border);
                    border-radius: 8px; padding: 12px;
                }
                .nc-aud-pulse-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
                .nc-aud-avatars { display: flex; }
                .nc-aud-avatar {
                    width: 26px; height: 26px; border-radius: 50%;
                    background: var(--bg-surface); border: 2px solid var(--bg-elevated);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 10px; font-weight: 700; color: var(--accent); margin-left: -6px;
                }
                .nc-aud-avatar:first-child { margin-left: 0; }
                .nc-aud-count-chip {
                    font-size: 10px; font-weight: 600; color: var(--text-secondary);
                    background: var(--bg-surface); border: 1px solid var(--border);
                    border-radius: 4px; padding: 2px 5px;
                }
                .nc-aud-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
                .nc-aud-stat {
                    background: var(--bg-surface); border: 1px solid var(--border);
                    border-radius: 6px; padding: 7px 9px;
                }
                .nc-aud-stat-val { font-size: 15px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
                .nc-aud-stat-lab { font-size: 10px; color: var(--text-muted); }

                /* Manual contacts */
                .nc-manual-form {
                    display: flex; flex-direction: column; gap: 8px;
                }
                .nc-phone-row { display: flex; gap: 6px; }
                .nc-country-code {
                    width: 72px; flex-shrink: 0;
                    background: var(--bg-elevated); border: 1px solid var(--border);
                    border-radius: 6px; padding: 7px 8px;
                    font-size: 13px; color: var(--text-primary); outline: none;
                    transition: border-color 150ms;
                }
                .nc-country-code:focus { border-color: var(--border-strong); }
                .nc-add-contact-btn {
                    display: flex; align-items: center; gap: 5px; justify-content: center;
                    padding: 7px; border-radius: 6px; font-size: 12px; font-weight: 500;
                    background: var(--accent-dim); color: var(--accent);
                    border: 1px solid var(--accent-glow); transition: all 120ms;
                }
                .nc-add-contact-btn:hover { background: rgba(16,185,129,0.15); }
                .nc-contact-list { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
                .nc-contact-item {
                    display: flex; align-items: center; gap: 8px;
                    padding: 8px 10px; background: var(--bg-elevated); border: 1px solid var(--border);
                    border-radius: 6px; font-size: 12px;
                }
                .nc-contact-remove { margin-left: auto; color: var(--text-muted); background: none; border: none; padding: 2px; border-radius: 3px; transition: color 120ms; }
                .nc-contact-remove:hover { color: var(--danger); }

                /* Maps mode */
                .nc-maps-form { display: flex; flex-direction: column; gap: 10px; }
                .nc-cat-chips { display: flex; flex-wrap: wrap; gap: 5px; }
                /* Maps Inline Lead Generation */
                .nc-lead-polling { display: flex; align-items: flex-start; gap: 8px; padding: 12px; background: rgba(34,197,94,0.05); border: 1px solid rgba(34,197,94,0.2); border-radius: 8px; font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.4; margin-top: 10px; }
                .nc-lead-ready { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
                .nc-lead-stats-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                .nc-lead-stat-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; text-align: center; }
                .nc-ls-val { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 2px; }
                .nc-ls-lab { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
                .nc-convert-aud-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; background: #00D87C; color: #000; cursor: pointer; transition: 120ms; }
                .nc-convert-aud-btn:hover:not(:disabled) { background: #00E585; }
                .nc-convert-aud-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .nc-lead-failed { padding: 12px; border-radius: 8px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); font-size: 13px; font-weight: 500; margin-top: 10px; }
                .nc-generate-btn {
                    display: flex; align-items: center; gap: 6px; justify-content: center;
                    padding: 9px; border-radius: 7px; font-size: 13px; font-weight: 600;
                    background: linear-gradient(135deg, var(--accent), #059669);
                    color: #fff; border: none; transition: all 120ms;
                    box-shadow: 0 2px 12px var(--accent-glow);
                }
                .nc-generate-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 20px var(--accent-glow); }
                .nc-generate-btn:disabled { opacity: 0.5; transform: none; }

                /* ── PREVIEW PANEL (CENTER) ── */
                .nc-preview {
                    display: flex; flex-direction: column; align-items: center;
                    background: var(--bg-base); overflow-y: auto; padding: 24px 20px;
                    gap: 20px;
                }

                /* Readiness */
                .nc-readiness {
                    display: flex; align-items: center; gap: 16px;
                    padding: 12px 20px; background: var(--bg-surface);
                    border: 1px solid var(--border); border-radius: 10px;
                    width: 100%; max-width: 440px;
                }
                .nc-readiness-steps { display: flex; align-items: center; flex: 1; }
                .nc-readiness-step-wrap { display: flex; align-items: center; }
                .nc-readiness-step {
                    display: flex; align-items: center; gap: 5px;
                    font-size: 11px; font-weight: 600; color: var(--text-muted);
                    padding: 4px 8px; border-radius: 99px;
                    border: 1px solid var(--border);
                    background: var(--bg-elevated); transition: all 200ms;
                }
                .nc-readiness-step--done {
                    color: var(--accent); border-color: var(--accent-glow);
                    background: var(--accent-dim);
                }
                .nc-readiness-line { width: 20px; height: 1px; background: var(--border); margin: 0 4px; transition: background 200ms; }
                .nc-readiness-line--done { background: var(--accent); }
                .nc-readiness-chip {
                    display: flex; align-items: center; gap: 4px;
                    font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
                    padding: 4px 8px; border-radius: 99px;
                    background: var(--bg-elevated); color: var(--text-muted);
                    border: 1px solid var(--border); white-space: nowrap;
                    transition: all 200ms;
                }
                .nc-readiness-chip--ready {
                    background: var(--accent-dim); color: var(--accent); border-color: var(--accent-glow);
                }



                /* Launch button */
                .nc-launch-btn {
                    display: flex; align-items: center; gap: 8px; justify-content: center;
                    padding: 12px 28px; border-radius: 10px; font-size: 14px; font-weight: 700;
                    background: linear-gradient(135deg, var(--accent), #059669);
                    color: #fff; border: none;
                    box-shadow: 0 4px 20px var(--accent-glow);
                    transition: all 150ms var(--ease-out);
                    letter-spacing: -0.01em; width: 100%; max-width: 440px;
                }
                .nc-launch-btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 30px var(--accent-glow);
                }
                .nc-launch-btn:active:not(:disabled) { transform: scale(0.98); }
                .nc-launch-btn:disabled { opacity: 0.35; cursor: not-allowed; }

                /* ── INTEL SIDEBAR (RIGHT) ── */
                .nc-intel {
                    border-left: 1px solid var(--border);
                    background: var(--bg-surface);
                    display: flex; flex-direction: column;
                    transition: width 220ms var(--ease-out);
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .nc-intel--collapsed { width: 52px; }
                .nc-intel--expanded { width: 260px; }
                .nc-intel-toggle {
                    display: flex; align-items: center; justify-content: center;
                    width: 52px; height: 52px; flex-shrink: 0;
                    background: none; border: none; color: var(--text-muted);
                    transition: color 120ms; cursor: pointer; border-bottom: 1px solid var(--border);
                }
                .nc-intel-toggle:hover { color: var(--text-primary); }
                .nc-intel-toggle--active { color: var(--accent); }
                .nc-intel-content { flex: 1; overflow-y: auto; padding: 14px; }
                .nc-intel-title {
                    font-size: 12px; font-weight: 700; color: var(--text-primary);
                    letter-spacing: -0.01em; margin-bottom: 14px;
                    display: flex; align-items: center; gap: 6px;
                }
                .nc-intel-section { margin-bottom: 16px; }
                .nc-intel-section-label {
                    font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
                    text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;
                }
                .nc-intel-metric {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 7px 10px; border-radius: 6px;
                    border: 1px solid var(--border); margin-bottom: 4px;
                    background: var(--bg-elevated);
                }
                .nc-intel-metric-label { font-size: 11px; color: var(--text-secondary); }
                .nc-intel-metric-value { font-size: 13px; font-weight: 700; color: var(--text-primary); }
                .nc-intel-metric-value.nc-val-good { color: var(--accent); }
                .nc-intel-metric-value.nc-val-warn { color: var(--warning); }
                .nc-intel-metric-value.nc-val-danger { color: var(--danger); }
                .nc-quality-bar {
                    height: 4px; background: var(--bg-elevated); border-radius: 99px;
                    overflow: hidden; margin-top: 8px;
                }
                .nc-quality-fill {
                    height: 100%; border-radius: 99px;
                    background: linear-gradient(90deg, var(--danger), var(--warning), var(--accent));
                    transition: width 500ms var(--ease-out);
                }
                .nc-exclude-btn {
                    font-size: 10px; color: var(--text-muted); background: none; border: 1px solid var(--border);
                    border-radius: 4px; padding: 2px 6px; transition: all 120ms;
                }
                .nc-exclude-btn:hover { color: var(--danger); border-color: rgba(238,0,0,0.3); background: rgba(238,0,0,0.05); }

                /* ── Modal shared classes ── */
                .nc-modal-box {
                    background: var(--bg-surface);
                    border: 1px solid var(--border-strong);
                    border-radius: 16px;
                    padding: 32px;
                    width: 100%;
                    max-width: 380px;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    box-shadow: 0 24px 64px rgba(0,0,0,0.7);
                }
                .nc-modal-box--center {
                    align-items: center;
                    text-align: center;
                }
                .nc-modal-close-btn {
                    position: absolute; top: 16px; right: 16px;
                    background: none; border: none;
                    color: var(--text-muted); cursor: pointer;
                    padding: 4px; border-radius: 4px;
                    transition: color 120ms;
                }
                .nc-modal-close-btn:hover { color: var(--text-primary); }
                .nc-modal-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
                .nc-modal-icon {
                    width: 36px; height: 36px; border-radius: 10px;
                    background: var(--accent-dim); border: 1px solid var(--accent-glow);
                    display: flex; align-items: center; justify-content: center;
                }
                .nc-modal-icon svg { color: var(--accent); }
                .nc-modal-title { font-weight: 700; font-size: 16px; color: var(--text-primary); letter-spacing: -0.02em; margin: 0; }
                .nc-modal-sub { font-size: 13px; color: var(--text-muted); margin: 0; }
                .nc-modal-field { display: flex; flex-direction: column; gap: 6px; }
                .nc-modal-field-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.04em; text-transform: uppercase; }
                .nc-modal-submit { width: 100%; justify-content: center; padding: 10px; }
                /* QR UI */
                .nc-qr-title { font-weight: 700; font-size: 16px; color: var(--text-primary); margin: 0 0 4px; }
                .nc-qr-title-accent { color: var(--accent); }
                .nc-qr-sub { font-size: 12px; color: var(--text-muted); margin: 0; }
                .nc-qr-connecting { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px 0; }
                .nc-qr-connecting-icon { color: var(--accent); }
                .nc-qr-connecting-text { font-size: 13px; color: var(--text-secondary); margin: 0; }
                .nc-qr-steps { font-size: 12px; color: var(--text-secondary); text-align: left; padding-left: 18px; margin: 0; display: flex; flex-direction: column; gap: 4px; }
                .nc-qr-code-wrap { padding: 12px; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
                .nc-qr-waiting { display: flex; align-items: center; gap: 8px; background: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.2); color: var(--warning); border-radius: 8px; padding: 8px 14px; font-size: 12px; width: 100%; justify-content: center; }
                .nc-qr-gen { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px 0; }
                .nc-qr-gen-icon { color: var(--accent); }
                .nc-qr-gen-text { font-size: 12px; color: var(--text-muted); margin: 0; }
                /* Simulator extras */
                .nc-sim-status-icons { display: flex; gap: 4px; }
                .nc-sim-media-label { font-size: 10px; color: #999; }
                .nc-sim-empty-icon { color: #555; margin-bottom: 4px; }
                .nc-sim-empty-text { font-size: 10px; color: #666; }
                /* Divider */
                .nc-header-divider { width: 1px; height: 18px; background: var(--border); flex-shrink: 0; }
                /* Session option inner */
                .nc-session-info { flex: 1; }
                .nc-session-item-name { font-weight: 500; color: var(--text-primary); font-size: 13px; }
                .nc-session-item-phone { font-size: 10px; color: var(--text-muted); }
                .nc-session-empty { padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center; }
                .nc-session-add { color: var(--accent); font-weight: 600; }
                .nc-session-check { color: var(--accent); }
                .nc-session-chevron { color: var(--text-muted); flex-shrink: 0; transition: transform 150ms; }
                .nc-session-chevron--open { transform: rotate(180deg); }
                .nc-no-session-warn--mt { margin-top: 6px; }
                /* Compose */
                .nc-required { color: var(--danger); }
                .nc-btn-sm-ghost { font-size: 11px; padding: 5px 10px; }
                .nc-btn-sm-ghost--danger { font-size: 11px; padding: 5px 10px; color: var(--danger); }
                .nc-compose-textarea { resize: vertical; min-height: 80px; }
                /* Audience tabs */
                .nc-aud-tabs--mb { margin-bottom: 12px; }
                /* Template empty */
                .nc-template-empty { font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px 0; border: 1px dashed var(--border); border-radius: 8px; }
                .nc-template-check-icon { color: #fff; }
                /* Contact item */
                .nc-contact-icon { color: var(--accent); flex-shrink: 0; }
                .nc-contact-info { flex: 1; }
                .nc-contact-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
                .nc-contact-phone { font-size: 10px; color: var(--text-muted); }
                /* Country code input */
                .nc-country-code--w { width: 72px; }
                /* Map result */
                .nc-map-result-info { flex: 1; min-width: 0; }
                .nc-map-check-icon { color: #fff; }
                .nc-map-phone-icon { color: var(--accent); flex-shrink: 0; }
                .nc-maps-count { font-size: 11px; color: var(--text-muted); }
                .nc-maps-btn-row { display: flex; gap: 8px; }
                /* Intel sidebar */
                .nc-intel-opt-row { display: flex; align-items: center; gap: 6px; }
                .nc-intel-metric--col { flex-direction: column; align-items: flex-start; gap: 2px; }
                .nc-intel-metric--col-mt { flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 4px; }
                .nc-intel-metric--rel { position: relative; }
                .nc-intel-score-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
                .nc-intel-score-num { font-size: 22px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.04em; }
                .nc-intel-score-denom { font-size: 10px; color: var(--text-muted); }
                .nc-intel-score-note { font-size: 10px; color: var(--text-muted); margin-top: 6px; }
                .nc-intel-metric-val-lg { font-size: 15px; }
                .nc-intel-icon { color: var(--accent); }
                /* Launch hint */
                .nc-launch-hint { font-size: 11px; color: var(--text-muted); text-align: center; }
                /* Misc utilities */
                .nc-radius-label { font-size: 10px; color: var(--text-muted); }
                .nc-select-mb { margin-bottom: 10px; }
            `}</style>

            {/* ── Modals ── */}
            {showAddSession && (
                <AddSessionModal
                    onClose={() => setShowAddSession(false)}
                    onCreated={(session) => {
                        setQrSession(session);
                        // Auto-select the new session once created
                        setDraft(d => ({ ...d, whatsappSessionId: session.id }));
                    }}
                />
            )}
            {qrSession && (
                <QRModal
                    session={qrSession}
                    onClose={() => setQrSession(null)}
                />
            )}

            <div className="nc-root">
                {/* Loading overlay while fetching existing draft */}
                {isLoadingEdit && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 size={32} className="animate-spin text-accent" />
                            <p className="text-sm text-muted">Loading draft…</p>
                        </div>
                    </div>
                )}
                {/* ── HEADER ─────────────────────────────────────────────────── */}
                <header className="nc-header">
                    <button className="nc-header-back" onClick={() => router.push('/campaigns')}>
                        <ArrowLeft size={14} />
                        {editId ? 'Back to Campaigns' : 'Back'}
                    </button>
                    <div className="nc-header-divider" />
                    <div className="nc-header-name-wrap">
                        {isEditingName ? (
                            <input
                                ref={nameInputRef}
                                className="nc-header-name-input"
                                title="Campaign name"
                                aria-label="Campaign name"
                                placeholder="Campaign name"
                                value={campaignName}
                                onChange={e => setCampaignName(e.target.value)}
                                onBlur={() => { setIsEditingName(false); setDraft(d => ({ ...d, name: campaignName })); }}
                                onKeyDown={e => { if (e.key === 'Enter') nameInputRef.current?.blur(); }}
                                autoFocus
                            />
                        ) : (
                            <span className="nc-header-name" onClick={() => setIsEditingName(true)}>{campaignName}</span>
                        )}
                    </div>
                    <div className="nc-header-actions">
                        <button
                            className="nc-save-btn"
                            onClick={() => saveDraftMutation.mutate()}
                            disabled={saveDraftMutation.isPending}
                        >
                            {saveDraftMutation.isPending
                                ? <><Loader2 size={12} className="animate-spin" /> Saving&hellip;</>
                                : draftSaved
                                ? <><Check size={12} /> Saved!</>
                                : <><Save size={12} /> Save Draft</>}
                        </button>
                    </div>
                </header>

                {/* ── WORKSPACE ──────────────────────────────────────────────── */}
                <div className="nc-workspace">

                    {/* ── ASSEMBLY PANEL ──────────────────────────────────────── */}
                    <aside className="nc-assembly">
                        <div className="nc-assembly-inner">

                            {/* Section: WhatsApp Session */}
                            <section>
                                <div className="nc-section-label">WhatsApp Session</div>
                                <div className="nc-session-selector">
                                    <button
                                        className={`nc-session-trigger ${sessionOpen ? 'nc-session-open' : ''}`}
                                        onClick={() => setSessionOpen(o => !o)}
                                    >
                                        <div className={`nc-status-dot ${
                                            selectedSession?.status === 'connected' || selectedSession?.status === 'CONNECTED'
                                                ? 'nc-status-dot--online' : 'nc-status-dot--offline'
                                        }`} />
                                        <span className="nc-session-name">
                                            {selectedSession ? selectedSession.name : 'Select account…'}
                                        </span>
                                        {selectedSession?.phoneNumber && (
                                            <span className="nc-session-phone">{selectedSession.phoneNumber}</span>
                                        )}
                                        <ChevronDown size={13} className={`nc-session-chevron ${sessionOpen ? 'nc-session-chevron--open' : ''}`} />
                                    </button>
                                    {sessionOpen && (
                                        <div className="nc-session-dropdown">
                                            {(sessions as WhatsAppSession[]).map(s => (
                                                <div
                                                    key={s.id}
                                                    className={`nc-session-option ${draft.whatsappSessionId === s.id ? 'nc-option-active' : ''}`}
                                                    onClick={() => {
                                                        setDraft(d => ({ ...d, whatsappSessionId: s.id }));
                                                        setSessionOpen(false);
                                                    }}
                                                >
                                                    <div className={`nc-status-dot ${
                                                        s.status === 'connected' || s.status === 'CONNECTED'
                                                            ? 'nc-status-dot--online' : 'nc-status-dot--offline'
                                                    }`} />
                                                    <div className="nc-session-info">
                                                        <div className="nc-session-item-name">{s.name}</div>
                                                        {s.phoneNumber && <div className="nc-session-item-phone">{s.phoneNumber}</div>}
                                                    </div>
                                                    {draft.whatsappSessionId === s.id && <Check size={12} className="nc-session-check" />}
                                                </div>
                                            ))}
                                            {sessions.length === 0 && (
                                                <div className="nc-session-empty">
                                                    No sessions found
                                                </div>
                                            )}
                                            <div
                                                className="nc-session-option nc-session-add"
                                                onClick={() => {
                                                    setSessionOpen(false);
                                                    setShowAddSession(true);
                                                }}
                                            >
                                                <Plus size={12} /> Add new session
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {!sessionReady && draft.whatsappSessionId && (
                                    <div className="nc-no-session-warn">
                                        <AlertTriangle size={12} />
                                        <span>Selected session is offline</span>
                                    </div>
                                )}
                                {!draft.whatsappSessionId && (
                                    <div className="nc-no-session-warn nc-no-session-warn--mt">
                                        <AlertTriangle size={12} />
                                        <span>Select a session to enable launch</span>
                                    </div>
                                )}
                            </section>

                            {/* Section: Message */}
                            <section>
                                <div className="nc-section-label">Message</div>

                                {/* Template Gallery */}
                                {!isComposeMode && (
                                    <>
                                        <div className="nc-template-grid-scroll">
                                            <div className="nc-template-grid">
                                                {(templates as MessageTemplate[]).map(t => {
                                                const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
                                                return (
                                                    <button
                                                        key={t.id}
                                                        className={`nc-template-card ${activeTemplateId === t.id ? 'nc-template-active' : ''}`}
                                                        onClick={() => applyTemplate(t)}
                                                    >
                                                        {activeTemplateId === t.id && (
                                                            <div className="nc-template-check">
                                                                <Check size={9} className="nc-template-check-icon" />
                                                            </div>
                                                        )}
                                                        {t.previewImageUrl ? (
                                                            /* Cached thumbnail — instant, no re-render */
                                                            <>
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={t.previewImageUrl.startsWith('blob:') ? t.previewImageUrl : `${t.previewImageUrl}?token=${token}`}
                                                                    alt={t.name}
                                                                    className="nc-template-thumb-img"
                                                                />
                                                                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end rounded-b-[7px]">
                                                                    <span className="text-[11px] font-semibold text-white/90 truncate drop-shadow-md text-left">{t.name}</span>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            /* Text fallback for un-previewed templates */
                                                            <>
                                                                <div className="nc-template-name">{t.name}</div>
                                                                <div className="nc-template-preview">{t.body}</div>
                                                                {t.buttonText && <div className="nc-template-badge">{t.buttonText}</div>}
                                                            </>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                            </div>
                                        </div>
                                        {templates.length === 0 && (
                                            <div className="nc-template-empty">
                                                No templates yet. Create one in Templates.
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Compose toggle */}
                                <button className="nc-compose-toggle" onClick={() => setIsComposeMode(o => !o)}>
                                    {isComposeMode ? <X size={12} /> : <Pencil size={12} />}
                                    {isComposeMode ? 'Back to gallery' : '✏️ Compose custom message'}
                                </button>

                                {/* ── Full Compose Builder (matches Template Studio) ── */}
                                {isComposeMode && (
                                    <div className="nc-compose-builder">

                                        {/* Header Media */}
                                        <div>
                                            <div className="flex justify-between items-end mb-2">
                                                <label className="nc-field-label !mb-0">Header Media <span className="nc-field-optional">(optional)</span></label>
                                                <button
                                                    className="nc-compose-add-btn bg-transparent border-none py-0 hover:bg-transparent !text-[10px] !pl-1.5"
                                                    onClick={() => { setComposeMediaId(''); fileInputRef.current?.click(); }}
                                                >
                                                    <Plus size={10} /> Upload
                                                </button>
                                            </div>

                                            <div className="flex overflow-x-auto gap-2 pb-2 nc-hide-scrollbar">
                                                {/* "No Media" Card */}
                                                <button
                                                    className={`relative flex-shrink-0 w-[72px] h-[54px] rounded-md border flex flex-col items-center justify-center gap-1 transition-all ${
                                                        !composeMediaId && !composeMedia
                                                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold'
                                                            : 'border-white/10 bg-black/20 text-white/50 hover:border-white/20 hover:text-white/80 font-medium'
                                                    }`}
                                                    onClick={() => { setComposeMediaId(''); setComposeMedia(undefined); }}
                                                >
                                                    <X size={14} />
                                                    <span className="text-[9px]">None</span>
                                                </button>

                                                {/* Uploaded File (if any) */}
                                                {composeMedia && (
                                                    <div className="relative flex-shrink-0 w-[90px] h-[54px] rounded-md border border-emerald-500 bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)] overflow-hidden">
                                                        <img src={composeMedia} alt="Uploaded preview" className="w-full h-full object-cover opacity-80" />
                                                        <div className="absolute inset-x-0 bottom-0 py-0.5 bg-black/60 text-center">
                                                            <span className="text-[8px] font-bold text-emerald-400">UPLOADED</span>
                                                        </div>
                                                        <button 
                                                            className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                                                            title="Remove uploaded media"
                                                            aria-label="Remove uploaded media"
                                                            onClick={(e) => { e.stopPropagation(); setComposeMedia(undefined); }}
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Existing Media Library */}
                                                {(mediaList as any[]).map(m => {
                                                    const isSelected = composeMediaId === m.id;
                                                    const baseToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
                                                    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
                                                    
                                                    return (
                                                        <button
                                                            key={m.id}
                                                            title={m.name}
                                                            onClick={() => { setComposeMediaId(m.id); setComposeMedia(undefined); }}
                                                            className={`relative flex-shrink-0 w-[90px] h-[54px] rounded-[6px] border overflow-hidden transition-all text-left ${
                                                                isSelected 
                                                                    ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)] opacity-100' 
                                                                    : 'border-white/10 opacity-70 hover:opacity-100 hover:border-white/30 cursor-pointer'
                                                            }`}
                                                        >
                                                            {m.type === 'image' ? (
                                                                <img src={`${apiBase}/media-gallery/${m.id}/file?token=${baseToken}`} alt={m.name} className="w-full h-full object-cover" />
                                                            ) : m.type === 'video' ? (
                                                                <>
                                                                    <video src={`${apiBase}/media-gallery/${m.id}/file?token=${baseToken}#t=0.001`} preload="metadata" className="w-full h-full object-cover" />
                                                                    <div className="absolute inset-x-0 top-0 bottom-4 flex items-center justify-center bg-black/10 pointer-events-none pt-1">
                                                                        <div className="w-[18px] h-[18px] rounded-full bg-white/30 backdrop-blur-[2px] flex items-center justify-center">
                                                                            <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[5px] border-l-white border-b-[3px] border-b-transparent ml-0.5 drop-shadow-md" />
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <div className="w-full h-full bg-[#1A2228] flex items-center justify-center border-t border-[rgba(255,255,255,0.02)]">
                                                                    <span className="text-white/40 text-[9px] font-bold tracking-wider">{m.type}</span>
                                                                </div>
                                                            )}
                                                            
                                                            <div className="absolute inset-x-0 bottom-0 p-[5px] bg-gradient-to-t from-black/90 via-black/60 to-transparent">
                                                                <div className="text-[8.5px] font-semibold text-white/95 truncate drop-shadow-md">
                                                                    {m.name}
                                                                </div>
                                                            </div>
                                                            
                                                            {isSelected && (
                                                                <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-xl flex items-center justify-center">
                                                                    <Check size={8} className="text-black stroke-[3px]" />
                                                                </div>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" hidden onChange={e => {
                                                const f = e.target.files?.[0];
                                                if (f) { setComposeMedia(URL.createObjectURL(f)); setComposeMediaId(''); }
                                            }} />
                                            
                                            {/* Hide webkit scrollbar just for this component */}
                                            <style dangerouslySetInnerHTML={{__html: `
                                                .nc-compose-builder div::-webkit-scrollbar { display: none; }
                                                .nc-hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
                                                .nc-hide-scrollbar::-webkit-scrollbar { display: none; }
                                            `}} />
                                        </div>

                                        {/* Message Body */}
                                        <div>
                                            <label className="nc-field-label">Message Body <span className="nc-required">*</span></label>
                                            <div className="nc-compose-textarea-wrap">
                                                <textarea
                                                    className="input nc-compose-textarea"
                                                    rows={5}
                                                    maxLength={1024}
                                                    placeholder={"Hello {{contact.name}}, check out our offer…"}
                                                    value={composeText}
                                                    onChange={e => setComposeText(e.target.value)}
                                                />
                                            </div>
                                            <div className="nc-char-count">{composeText.length}/1024</div>
                                        </div>

                                        {/* Variable help + simulators */}
                                        <div className="nc-var-hint">
                                            <HelpCircle size={11} className="nc-var-hint-icon" />
                                            <span>Use <code className="nc-var-code">{'{{contact.name}}'}</code> — namespaces: <em>contact, workspace, event</em></span>
                                        </div>
                                        {Object.keys(composeVars).length > 0 && (
                                            <div className="nc-vars-sim">
                                                <div className="nc-vars-sim-label">Simulate variables</div>
                                                <div className="nc-vars-sim-grid">
                                                    {Object.entries(composeVars).map(([key, val]) => (
                                                        <div key={key}>
                                                            <label className="nc-field-label">{key}</label>
                                                            <input
                                                                className="input"
                                                                title={`Simulate {{${key}}}`}
                                                                value={val}
                                                                onChange={e => setComposeVars(v => ({ ...v, [key]: e.target.value }))}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Footer */}
                                        <div>
                                            <label className="nc-field-label">Footer <span className="nc-field-optional">(optional)</span></label>
                                            <input
                                                className="input"
                                                maxLength={60}
                                                placeholder="e.g. Reply STOP to opt out"
                                                value={composeFooter}
                                                onChange={e => setComposeFooter(e.target.value)}
                                            />
                                            <div className="nc-char-count">{composeFooter.length}/60</div>
                                        </div>

                                        {/* Interactive Buttons */}
                                        <div>
                                            <div className="nc-compose-btn-header">
                                                <label className="nc-field-label !mb-0">Buttons <span className="nc-field-optional">(up to 3)</span></label>
                                                {composeButtons.length < 3 && (
                                                    <button
                                                        className="nc-compose-add-btn"
                                                        onClick={() => setComposeButtons(b => [...b, { type: 'quick_reply', label: 'New Button', payload: '' }])}
                                                    >
                                                        <Plus size={11} /> Add
                                                    </button>
                                                )}
                                            </div>
                                            {composeButtons.length === 0 ? (
                                                <div className="nc-compose-no-btns">No buttons — add quick replies, URL links, or phone calls.</div>
                                            ) : (
                                                <div className="nc-compose-btns-list">
                                                    {composeButtons.map((btn, idx) => (
                                                        <div key={idx} className="nc-compose-btn-row">
                                                            <select
                                                                title="Button type"
                                                                className="input nc-compose-select nc-btn-type-sel"
                                                                value={btn.type}
                                                                onChange={e => { const n = [...composeButtons]; n[idx] = { ...n[idx], type: e.target.value as ComposeButton['type'] }; setComposeButtons(n); }}
                                                            >
                                                                <option value="quick_reply">Quick Reply</option>
                                                                <option value="url">URL Link</option>
                                                                <option value="call">Phone Call</option>
                                                            </select>
                                                            <input
                                                                className="input"
                                                                placeholder="Button label"
                                                                maxLength={25}
                                                                value={btn.label}
                                                                onChange={e => { const n = [...composeButtons]; n[idx] = { ...n[idx], label: e.target.value }; setComposeButtons(n); }}
                                                            />
                                                            <button
                                                                title="Remove button"
                                                                className="nc-compose-rm-btn"
                                                                onClick={() => setComposeButtons(b => b.filter((_, i) => i !== idx))}
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                            {(btn.type === 'url' || btn.type === 'call') && (
                                                                <input
                                                                    className="input nc-btn-payload"
                                                                    placeholder={btn.type === 'url' ? 'https://example.com' : '+1234567890'}
                                                                    value={btn.payload}
                                                                    onChange={e => { const n = [...composeButtons]; n[idx] = { ...n[idx], payload: e.target.value }; setComposeButtons(n); }}
                                                                />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Save to Templates API */}
                                        <div className="nc-compose-save-wrap">
                                            <div className="nc-save-opts">
                                                <label className="nc-field-label">Template Name <span className="nc-field-optional">(to save for future use)</span></label>
                                                <input
                                                    className="input"
                                                    placeholder="e.g. spring_sale_2026"
                                                    value={templateName}
                                                    title="Name must be lowercase alphanumeric and underscores"
                                                    onChange={e => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                                                />
                                            </div>
                                            <button
                                                className="nc-apply-btn w-full"
                                                onClick={() => saveTemplateMutation.mutate()}
                                                disabled={!templateName.trim() || !composeText.trim() || saveTemplateMutation.isPending}
                                                title="Saves this to your global Templates library so you can reuse it later"
                                            >
                                                {saveTemplateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                                Save Template & Apply
                                            </button>
                                        </div>

                                    </div>
                                )}
                            </section>

                            {/* Section: Audience */}
                            <section>
                                <div className="nc-section-label">Audience</div>
                                {/* Mode tabs */}
                                <div className="nc-aud-tabs nc-aud-tabs--mb">
                                    <button className={`nc-aud-tab ${audienceMode === 'list' ? 'nc-aud-tab--active' : ''}`} onClick={() => setAudienceMode('list')}>
                                        <Users size={11} /> List
                                    </button>
                                    <button className={`nc-aud-tab ${audienceMode === 'manual' ? 'nc-aud-tab--active' : ''}`} onClick={() => setAudienceMode('manual')}>
                                        <UserPlus size={11} /> New
                                    </button>
                                    <button className={`nc-aud-tab ${audienceMode === 'maps' ? 'nc-aud-tab--active' : ''}`} onClick={() => setAudienceMode('maps')}>
                                        <MapPin size={11} /> Maps
                                    </button>
                                </div>

                                {/* Mode: Existing list */}
                                {audienceMode === 'list' && (
                                    <div>
                                        <select
                                            className="input nc-select-mb"
                                            title="Select audience list"
                                            aria-label="Select audience list"
                                            value={draft.audience.listId ?? ''}
                                            onChange={e => setDraft(d => ({ ...d, audience: { ...d.audience, listId: e.target.value || undefined } }))}
                                        >
                                            <option value="">Select audience list…</option>
                                            {audiences.map((a: any) => (
                                                <option key={a.id} value={a.id}>{a.name} · {a.memberCount} members</option>
                                            ))}
                                        </select>
                                        {selectedAudience && (
                                            <div className="nc-aud-pulse">
                                                <div className="nc-aud-pulse-row">
                                                    <div className="nc-aud-avatars">
                                                        {['A', 'B', 'C'].map(l => (
                                                            <div key={l} className="nc-aud-avatar">{l}</div>
                                                        ))}
                                                    </div>
                                                    <div className="nc-aud-count-chip">+{Math.max(0, (selectedAudience.memberCount ?? 0) - 3)} more</div>
                                                </div>
                                                <div className="nc-aud-stats">
                                                    <div className="nc-aud-stat">
                                                        <div className="nc-aud-stat-val">{selectedAudience.memberCount ?? 0}</div>
                                                        <div className="nc-aud-stat-lab">Valid numbers</div>
                                                    </div>
                                                    <div className="nc-aud-stat">
                                                        <div className="nc-aud-stat-val">~{Math.round((selectedAudience.memberCount ?? 0) * 0.92)}</div>
                                                        <div className="nc-aud-stat-lab">Est. reachable</div>
                                                    </div>
                                                    <div className="nc-aud-stat">
                                                        <div className="nc-aud-stat-val">{Math.round((selectedAudience.memberCount ?? 0) * 0.03)}</div>
                                                        <div className="nc-aud-stat-lab">Opt-outs (30d)</div>
                                                    </div>
                                                    <div className="nc-aud-stat">
                                                        <div className="nc-aud-stat-val">{selectedAudience.memberCount ?? 0}</div>
                                                        <div className="nc-aud-stat-lab">Credits est.</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Mode: Manual */}
                                {audienceMode === 'manual' && (
                                    <div className="nc-manual-form">
                                        <div>
                                            <label className="nc-field-label">Full Name</label>
                                            <input className="input" placeholder="Contact name" value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="nc-field-label">Phone Number</label>
                                            <div className="nc-phone-row">
                                                <input
                                                    className="nc-country-code input nc-country-code--w"
                                                    placeholder="+91"
                                                    value={manualForm.countryCode}
                                                    onChange={e => setManualForm(f => ({ ...f, countryCode: e.target.value }))}
                                                />
                                                <input className="input" placeholder="Phone number" value={manualForm.phone} onChange={e => setManualForm(f => ({ ...f, phone: e.target.value }))} />
                                            </div>
                                        </div>
                                        <button className="nc-add-contact-btn" onClick={addManualContact}>
                                            <UserPlus size={13} /> Add to Audience
                                        </button>
                                        {manualContacts.length > 0 && (
                                            <div className="nc-contact-list">
                                                {manualContacts.map(c => (
                                                    <div key={c.id} className="nc-contact-item">
                                                        <Phone size={11} className="nc-contact-icon" />
                                                        <div className="nc-contact-info">
                                                            <div className="nc-contact-name">{c.name}</div>
                                                            <div className="nc-contact-phone">{c.phone}</div>
                                                        </div>
                                                        <button
                                                            className="nc-contact-remove"
                                                            title={`Remove ${c.name}`}
                                                            aria-label={`Remove ${c.name}`}
                                                            onClick={() => setManualContacts(p => p.filter(x => x.id !== c.id))}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Mode: Google Maps Lead Generation */}
                                {audienceMode === 'maps' && (
                                    <div className="nc-maps-form">
                                        <div>
                                            <label className="nc-field-label">Target Audience / Business Type</label>
                                            <input
                                                className="input"
                                                placeholder="e.g. Real Estate Agents"
                                                value={leadKeyword}
                                                onChange={e => setLeadKeyword(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="nc-field-label">Location</label>
                                            <input
                                                className="input"
                                                placeholder="e.g. Ernakulam, Kerala"
                                                value={leadLocation}
                                                onChange={e => setLeadLocation(e.target.value)}
                                            />
                                        </div>

                                        <button
                                            className="nc-generate-btn"
                                            disabled={!leadKeyword || !leadLocation || isGeneratingLeads}
                                            onClick={handleGenerateLeads}
                                        >
                                            {isGeneratingLeads ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                                            {isGeneratingLeads ? 'Starting Generation…' : 'Generate Leads'}
                                        </button>

                                        {leadListDetail && (
                                            <div className="nc-lead-inline-status">
                                                {(leadListDetail.status === 'PROCESSING' || leadListDetail.status === 'PENDING') && (
                                                    <div className="nc-lead-polling animate-pulse">
                                                        <Loader2 size={16} className="animate-spin text-accent" />
                                                        <span>Scraping area... this takes a few minutes depending on location size. Please wait.</span>
                                                    </div>
                                                )}
                                                {leadListDetail.status === 'READY' && (
                                                    <div className="nc-lead-ready">
                                                        <div className="nc-lead-stats-row">
                                                            <div className="nc-lead-stat-box">
                                                                <div className="nc-ls-val">{leadListDetail.totalFound}</div>
                                                                <div className="nc-ls-lab">Total Found</div>
                                                            </div>
                                                            <div className="nc-lead-stat-box">
                                                                <div className="nc-ls-val">{leadListDetail.withPhone}</div>
                                                                <div className="nc-ls-lab">With Phone</div>
                                                            </div>
                                                        </div>
                                                        <button
                                                            className="nc-convert-aud-btn"
                                                            disabled={isConvertingLeads || leadListDetail.withPhone === 0}
                                                            onClick={handleConvertLeads}
                                                        >
                                                            {isConvertingLeads ? <Loader2 size={14} className="animate-spin" /> : <Users2 size={14} />}
                                                            {isConvertingLeads ? 'Converting to Audience…' : 'Convert & Use as Audience'}
                                                        </button>
                                                    </div>
                                                )}
                                                {leadListDetail.status === 'FAILED' && (
                                                    <div className="nc-lead-failed text-red-500">
                                                        Failed: {leadListDetail.errorReason || 'Unknown error'}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                        </div>
                    </aside>

                    {/* ── PREVIEW PANEL ────────────────────────────────────────── */}
                    <main className="nc-preview">
                        {/* Readiness steps */}
                        <ReadinessSteps
                            sessionReady={sessionReady}
                            messageReady={messageReady}
                            audienceReady={audienceReady}
                            allReady={allReady}
                        />

                        {/* Phone simulator */}
                        <PhoneSimulator
                            draft={draft}
                            recipientCount={recipientCount}
                            sessionName={selectedAudience?.name ?? selectedSession?.name ?? ''}
                            mediaList={mediaList}
                            previewRef={previewRef}
                        />

                        {/* Launch button */}
                        <button
                            className="nc-launch-btn"
                            disabled={!allReady || createMutation.isPending}
                            onClick={handleLaunch}
                        >
                            {createMutation.isPending ? (
                                <><Loader2 size={16} className="animate-spin" /> Launching…</>
                            ) : (
                                <><Send size={16} /> Launch Campaign</>
                            )}
                        </button>

                        {!allReady && (
                            <p className="nc-launch-hint">
                                Complete all 3 steps above to enable launch
                            </p>
                        )}
                    </main>

                    {/* ── INTEL SIDEBAR ─────────────────────────────────────────── */}
                    <aside className={`nc-intel ${intelExpanded ? 'nc-intel--expanded' : 'nc-intel--collapsed'}`}>
                        <button
                            className={`nc-intel-toggle ${intelExpanded ? 'nc-intel-toggle--active' : ''}`}
                            onClick={() => setIntelExpanded(o => !o)}
                            title="Delivery Risk & Insights"
                        >
                            <Shield size={18} />
                        </button>

                        {intelExpanded && (
                            <div className="nc-intel-content">
                                <div className="nc-intel-title">
                                    <Shield size={14} className="nc-intel-icon" />
                                    Delivery Intelligence
                                </div>

                                <div className="nc-intel-section">
                                    <div className="nc-intel-section-label">Delivery Risk</div>
                                    <div className="nc-intel-metric">
                                        <span className="nc-intel-metric-label">Valid numbers</span>
                                        <span className="nc-intel-metric-value nc-val-good">{Math.round(recipientCount * 0.92)}</span>
                                    </div>
                                    <div className="nc-intel-metric nc-intel-metric--rel">
                                        <span className="nc-intel-metric-label">Opt-outs (30d)</span>
                                        <div className="nc-intel-opt-row">
                                            <span className="nc-intel-metric-value nc-val-warn">{Math.round(recipientCount * 0.03)}</span>
                                            <button className="nc-exclude-btn">Exclude</button>
                                        </div>
                                    </div>
                                    <div className="nc-intel-metric">
                                        <span className="nc-intel-metric-label">Invalid numbers</span>
                                        <span className="nc-intel-metric-value nc-val-danger">{Math.round(recipientCount * 0.05)}</span>
                                    </div>
                                    <div className="nc-intel-metric">
                                        <span className="nc-intel-metric-label">Est. credits</span>
                                        <span className="nc-intel-metric-value">{Math.round(recipientCount * 0.92)}</span>
                                    </div>
                                </div>

                                <div className="nc-intel-section">
                                    <div className="nc-intel-section-label">Quality Score</div>
                                    <div className="nc-intel-score-row">
                                        <span className="nc-intel-score-num">84</span>
                                        <span className="nc-intel-score-denom">/100</span>
                                    </div>
                                    <div className="nc-quality-bar">
                                        <div className="nc-quality-fill w-[84%]" />
                                    </div>
                                    <p className="nc-intel-score-note">Based on opt-out rate and engagement predictions</p>
                                </div>

                                <div className="nc-intel-section">
                                    <div className="nc-intel-section-label">Insights</div>
                                    <div className="nc-intel-metric nc-intel-metric--col">
                                        <span className="nc-intel-metric-label">Best send time</span>
                                        <span className="nc-intel-metric-value nc-intel-metric-val-lg">Tue · 10–11am</span>
                                    </div>
                                    <div className="nc-intel-metric nc-intel-metric--col-mt">
                                        <span className="nc-intel-metric-label">Est. replies (15%)</span>
                                        <span className="nc-intel-metric-value nc-val-good nc-intel-metric-val-lg">{Math.round(recipientCount * 0.15)}</span>
                                    </div>
                                    <div className="nc-intel-metric nc-intel-metric--col-mt">
                                        <span className="nc-intel-metric-label">Est. delivery time</span>
                                        <span className="nc-intel-metric-value nc-intel-metric-val-lg">~{Math.ceil(recipientCount * 5 / 60)} min</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </>
    );
}
