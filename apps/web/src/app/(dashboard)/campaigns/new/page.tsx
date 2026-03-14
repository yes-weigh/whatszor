'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { ArrowLeft, ArrowRight, Check, Megaphone, Users, Eye, Send, Calendar, Loader2, Search, X } from 'lucide-react';

type Step = 'template' | 'contacts' | 'preview' | 'schedule';
const STEPS: Step[] = ['template', 'contacts', 'preview', 'schedule'];
const STEP_LABELS: Record<Step, string> = {
    template: 'Template',
    contacts: 'Contacts',
    preview: 'Preview',
    schedule: 'Send',
};
const STEP_ICONS: Record<Step, React.ElementType> = {
    template: Megaphone,
    contacts: Users,
    preview: Eye,
    schedule: Send,
};

export default function NewCampaignPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('template');
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
    const [contactSearch, setContactSearch] = useState('');
    const [name, setName] = useState('');
    const [whatsappAccountId, setWhatsappAccountId] = useState('');
    const [scheduleType, setScheduleType] = useState<'now' | 'later'>('now');
    const [scheduledAt, setScheduledAt] = useState('');

    const { data: templates = [] } = useQuery({
        queryKey: ['templates'],
        queryFn: () =>
            api.get('/templates').then(r => {
                const list: any[] = r.data?.templates ?? r.data?.data ?? [];
                // Normalize: flatten the latest version's messageText into a top-level body field
                return list.map((t: any) => ({
                    ...t,
                    body: t.body ?? t.versions?.[0]?.messageText ?? '',
                }));
            }),
    });

    const { data: contacts = [] } = useQuery({
        queryKey: ['contacts', contactSearch],
        queryFn: () => api.get(`/crm/contacts?search=${contactSearch}&limit=100`).then(r => r.data?.data ?? []),
    });

    const { data: accounts = [] } = useQuery({
        queryKey: ['whatsappAccounts'],
        queryFn: () => api.get('/whatsapp/sessions').then(r => r.data?.data ?? []),
    });

    const createMutation = useMutation({
        mutationFn: (payload: any) => api.post('/campaigns', payload),
        onSuccess: (res) => {
            const id = res.data?.data?.id;
            if (schedule === 'now' && id) {
                api.post(`/campaigns/${id}/start`).catch(console.error);
            }
            router.push('/campaigns');
        },
    });

    const stepIndex = STEPS.indexOf(step);
    const schedule = scheduleType;

    const goNext = () => setStep(STEPS[stepIndex + 1]);
    const goPrev = () => {
        if (stepIndex === 0) router.push('/campaigns');
        else setStep(STEPS[stepIndex - 1]);
    };

    const canNext = () => {
        if (step === 'template') return !!selectedTemplate;
        if (step === 'contacts') return selectedContacts.length > 0;
        if (step === 'preview') return !!name.trim();
        return true;
    };

    const handleLaunch = () => {
        createMutation.mutate({
            name,
            templateId: selectedTemplate?.id,
            contactIds: selectedContacts,
            whatsappAccountId: whatsappAccountId || undefined,
            status: 'DRAFT',
            scheduledAt: scheduleType === 'later' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        });
    };

    const toggleContact = (id: string) => {
        setSelectedContacts(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const selectAll = () => setSelectedContacts((contacts as any[]).map((c: any) => c.id));
    const clearAll = () => setSelectedContacts([]);

    return (
        <div className="min-h-screen bg-body flex flex-col">
            {/* Top nav */}
            <div className="px-6 py-4 border-b border-theme bg-surface flex items-center gap-4">
                <button onClick={goPrev} className="flex items-center gap-1.5 text-sm text-muted hover:text-primary">
                    <ArrowLeft size={15} />
                    {stepIndex === 0 ? 'Cancel' : 'Back'}
                </button>
                <h1 className="font-semibold text-primary">New Campaign</h1>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-center gap-0 py-6 px-4">
                {STEPS.map((s, i) => {
                    const Icon = STEP_ICONS[s];
                    const done = i < stepIndex;
                    const active = s === step;
                    return (
                        <div key={s} className="flex items-center">
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                                active ? 'bg-accent text-white' :
                                done ? 'bg-accent/20 text-accent' :
                                'bg-elevated text-muted'
                            }`}>
                                {done ? <Check size={14} /> : <Icon size={14} />}
                                {STEP_LABELS[s]}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`h-px w-8 mx-1 ${done ? 'bg-accent/40' : 'bg-theme'}`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Step Content */}
            <div className="flex-1 p-6 max-w-3xl mx-auto w-full">

                {/* STEP 1: Template */}
                {step === 'template' && (
                    <div className="flex flex-col gap-4">
                        <h2 className="text-lg font-bold text-primary">Select a Template</h2>
                        <p className="text-sm text-muted">Choose the WhatsApp message template for this campaign.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(templates as any[]).map((t: any) => (
                                <button key={t.id}
                                    onClick={() => setSelectedTemplate(t)}
                                    className={`card text-left transition-all ${
                                        selectedTemplate?.id === t.id
                                            ? 'border-accent ring-1 ring-accent'
                                            : 'hover:border-accent/40'
                                    }`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-sm text-primary">{t.name}</p>
                                            <p className="text-xs text-muted mt-0.5 line-clamp-2">{t.body}</p>
                                        </div>
                                        {selectedTemplate?.id === t.id && (
                                            <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center shrink-0">
                                                <Check size={11} className="text-white" />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {(templates as any[]).length === 0 && (
                                <p className="text-sm text-muted col-span-2 py-8 text-center">
                                    No templates found. Create one in the Templates section first.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* STEP 2: Contacts */}
                {step === 'contacts' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-primary">Select Recipients</h2>
                            <div className="flex gap-2 text-xs">
                                <button onClick={selectAll} className="text-accent hover:underline">Select all</button>
                                <span className="text-muted">·</span>
                                <button onClick={clearAll} className="text-muted hover:text-primary">Clear</button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-theme bg-elevated">
                            <Search size={13} className="text-muted" />
                            <input className="bg-transparent text-sm outline-none flex-1 text-primary placeholder:text-muted"
                                placeholder="Search contacts…"
                                value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
                            {contactSearch && (
                            <button title="Clear search" aria-label="Clear contact search" onClick={() => setContactSearch('')}><X size={13} className="text-muted" /></button>
                            )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted">
                            <span>{selectedContacts.length} selected</span>
                            <span>{(contacts as any[]).length} contacts</span>
                        </div>
                        <div className="card p-0 overflow-hidden max-h-96 overflow-y-auto">
                            {(contacts as any[]).map((c: any) => (
                                <button key={c.id} onClick={() => toggleContact(c.id)}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-theme hover:bg-hover transition-colors">
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                        selectedContacts.includes(c.id) ? 'bg-accent border-accent' : 'border-theme'
                                    }`}>
                                        {selectedContacts.includes(c.id) && <Check size={11} className="text-white" />}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-medium text-primary">{c.firstName} {c.lastName}</p>
                                        <p className="text-xs text-muted">{c.phone || c.email || '—'}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 3: Preview */}
                {step === 'preview' && (
                    <div className="flex flex-col gap-6">
                        <h2 className="text-lg font-bold text-primary">Preview & Name</h2>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-secondary">Campaign Name</label>
                            <input className="input" placeholder="e.g. March Promo Blast"
                                value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-secondary">Send Message From</label>
                            <select className="input" aria-label="Send Message From" value={whatsappAccountId} onChange={e => setWhatsappAccountId(e.target.value)}>
                                <option value="">Auto-select strategy (Default)</option>
                                {(accounts as any[]).map((acc: any) => (
                                    <option key={acc.id} value={acc.id}>
                                        {acc.name} {acc.phoneNumber ? `(+${acc.phoneNumber.replace('+', '')})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="card bg-elevated/50">
                                <p className="text-xs text-muted font-medium uppercase tracking-wide mb-3">Template</p>
                                <p className="font-semibold text-sm text-primary">{selectedTemplate?.name}</p>
                                <p className="text-xs text-muted mt-1 line-clamp-3">{selectedTemplate?.body}</p>
                            </div>
                            <div className="card bg-elevated/50">
                                <p className="text-xs text-muted font-medium uppercase tracking-wide mb-3">Recipients</p>
                                <p className="text-2xl font-bold text-primary">{selectedContacts.length}</p>
                                <p className="text-xs text-muted mt-1">contacts selected</p>
                            </div>
                        </div>
                        {/* WhatsApp phone preview */}
                        <div className="flex justify-center">
                            <div className="w-64 bg-[#1a1a2e] rounded-3xl border-2 border-gray-700 p-4 shadow-2xl">
                                <div className="bg-[#075e54] rounded-t-2xl px-3 py-2 mb-2">
                                    <p className="text-white text-xs font-medium">WhatsApp Preview</p>
                                </div>
                                <div className="bg-[#dcf8c6] rounded-xl rounded-tl-none p-3 max-w-[85%] shadow-sm">
                                    <p className="text-gray-800 text-xs leading-relaxed">
                                        {selectedTemplate?.body || 'No message body.'}
                                    </p>
                                    <p className="text-gray-500 text-[10px] text-right mt-1">12:00 ✓✓</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 4: Schedule */}
                {step === 'schedule' && (
                    <div className="flex flex-col gap-6">
                        <h2 className="text-lg font-bold text-primary">Schedule & Launch</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {([
                                { value: 'now', label: 'Send Now', sub: 'Start sending immediately after launch', icon: Send },
                                { value: 'later', label: 'Schedule', sub: 'Pick a date & time to send', icon: Calendar },
                            ] as const).map(opt => (
                                <button key={opt.value} onClick={() => setScheduleType(opt.value)}
                                    className={`card text-left transition-all ${
                                        scheduleType === opt.value ? 'border-accent ring-1 ring-accent' : 'hover:border-accent/40'
                                    }`}>
                                    <opt.icon size={20} className={scheduleType === opt.value ? 'text-accent' : 'text-muted'} />
                                    <p className="font-semibold text-sm text-primary mt-2">{opt.label}</p>
                                    <p className="text-xs text-muted mt-0.5">{opt.sub}</p>
                                </button>
                            ))}
                        </div>
                        {scheduleType === 'later' && (
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-secondary">Scheduled Date & Time</label>
                                <input type="datetime-local" className="input" aria-label="Scheduled send date and time"
                                    value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                            </div>
                        )}
                        {/* Summary box */}
                        <div className="card bg-accent/5 border-accent/20">
                            <p className="text-sm font-semibold text-primary mb-2">Campaign Summary</p>
                            <div className="flex flex-col gap-1 text-xs text-muted">
                                <p><span className="text-secondary">Name:</span> {name}</p>
                                <p><span className="text-secondary">Template:</span> {selectedTemplate?.name}</p>
                                <p><span className="text-secondary">Recipients:</span> {selectedContacts.length} contacts</p>
                                <p><span className="text-secondary">Send:</span> {scheduleType === 'now' ? 'Immediately' : scheduledAt || 'Not set'}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Buttons */}
            <div className="sticky bottom-0 bg-surface border-t border-theme px-6 py-4 flex justify-between">
                <button className="btn bg-elevated text-secondary" onClick={goPrev}>
                    {stepIndex === 0 ? 'Cancel' : <><ArrowLeft size={14} /> Back</>}
                </button>
                {stepIndex < STEPS.length - 1 ? (
                    <button className="btn btn-primary flex items-center gap-2"
                        onClick={goNext} disabled={!canNext()}>
                        Next <ArrowRight size={14} />
                    </button>
                ) : (
                    <button className="btn btn-primary flex items-center gap-2"
                        onClick={handleLaunch}
                        disabled={!canNext() || createMutation.isPending || (scheduleType === 'later' && !scheduledAt)}>
                        {createMutation.isPending ? (
                            <><Loader2 size={14} className="animate-spin" /> Launching...</>
                        ) : (
                            <><Send size={14} /> {scheduleType === 'now' ? 'Launch Campaign' : 'Schedule Campaign'}</>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}
