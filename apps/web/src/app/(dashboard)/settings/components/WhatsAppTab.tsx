'use client';

import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import api from '@/lib/api';
import {
    Smartphone, CheckCircle2, MonitorSmartphone, Unplug,
    Loader2, Plus, Trash2, Wifi, WifiOff, RefreshCw, X, Brain
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ── Types ──────────────────────────────────────────────────────────────────

interface WASession {
    id: string;
    sessionId: string;
    name: string;
    phoneNumber: string | null;
    status: 'DISCONNECTED' | 'CONNECTING' | 'NEEDS_SCAN' | 'CONNECTED';
    qrCode?: string;
    isKnowledgeBot: boolean;
}

// ── QR Modal ───────────────────────────────────────────────────────────────

function QRModal({ session, onClose }: { session: WASession; onClose: () => void }) {
    const qc = useQueryClient();

    // Poll this single session's status while modal is open
    const { data } = useQuery<WASession>({
        queryKey: ['wa-accounts', session.sessionId],
        queryFn: () => api.get(`/whatsapp/sessions/${session.sessionId}/status`).then(r => r.data?.data),
        refetchInterval: 2500,
    });

    const live = data || session;

    // Auto-close when connected
    useEffect(() => {
        if (live.status === 'CONNECTED') {
            qc.invalidateQueries({ queryKey: ['wa-accounts'] });
            onClose();
        }
    }, [live.status, qc, onClose]);

    if (live.status === 'CONNECTED') {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface border border-surface-elevated rounded-2xl shadow-2xl w-full max-w-sm flex flex-col items-center gap-6 p-8 relative">
                <button onClick={onClose} title="Close" className="absolute top-4 right-4 text-muted hover:text-primary transition-colors">
                    <X size={18} />
                </button>
                <h3 className="font-bold text-lg text-primary">Connect <span className="text-blue-400">{live.name}</span></h3>

                {/* CONNECTING */}
                {live.status === 'CONNECTING' && (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <Loader2 size={40} className="animate-spin text-primary" />
                        <p className="text-sm text-secondary text-center">Initialising connection with WhatsApp servers…</p>
                    </div>
                )}

                {/* NEEDS_SCAN */}
                {live.status === 'NEEDS_SCAN' && live.qrCode && (
                    <>
                        <ol className="text-sm text-secondary text-left list-decimal pl-5 flex flex-col gap-1.5 w-full">
                            <li>Open WhatsApp → tap <strong>Menu</strong> / <strong>Settings</strong></li>
                            <li>Tap <strong>Linked Devices</strong> → <strong>Link a Device</strong></li>
                            <li>Scan the QR code below</li>
                        </ol>
                        <div className="p-3 bg-white rounded-xl shadow border border-gray-100">
                            <QRCode value={live.qrCode} size={220} />
                        </div>
                        <div className="flex items-center gap-2 text-yellow-600 text-xs bg-yellow-50 px-3 py-2 rounded-lg border border-yellow-100 w-full justify-center">
                            <Loader2 size={14} className="animate-spin" /> Waiting for scan…
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Add Account Modal ──────────────────────────────────────────────────────

function AddAccountModal({ onClose, onCreated }: { onClose: () => void, onCreated: (session: WASession) => void }) {
    const qc = useQueryClient();
    const [name, setName] = useState('');

    const createMutation = useMutation({
        mutationFn: (n: string) => api.post('/whatsapp/sessions', { name: n }).then(r => r.data?.data),
        onSuccess: async (account) => {
            // Immediately start the connection
            await api.post(`/whatsapp/sessions/${account.sessionId}/connect`);
            qc.invalidateQueries({ queryKey: ['wa-accounts'] });
            onCreated(account);
            onClose();
        },
        onError: (e: any) => {
            alert(e.response?.data?.message || 'Failed to create account');
        },
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface border border-surface-elevated rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-5 p-8 relative">
                <button onClick={onClose} title="Close" className="absolute top-4 right-4 text-muted hover:text-primary transition-colors">
                    <X size={18} />
                </button>
                <div>
                    <h3 className="font-bold text-lg text-primary">Add WhatsApp Account</h3>
                    <p className="text-sm text-secondary mt-1">Give this account a label so you can identify it later.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-secondary uppercase tracking-wider">Account Label</label>
                    <input
                        className="input"
                        placeholder="e.g. Sales North, Support, CEO"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && name.trim() && createMutation.mutate(name)}
                        autoFocus
                    />
                </div>
                <button
                    className="btn btn-primary w-full"
                    disabled={!name.trim() || createMutation.isPending}
                    onClick={() => createMutation.mutate(name)}
                >
                    {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Continue →'}
                </button>
            </div>
        </div>
    );
}

// ── Session Card ───────────────────────────────────────────────────────────

function SessionCard({ session, onReconnect, onOpenQR }: { session: WASession; onReconnect: (s: WASession) => void; onOpenQR: (s: WASession) => void }) {
    const qc = useQueryClient();

    const disconnectMutation = useMutation({
        mutationFn: () => api.post(`/whatsapp/sessions/${session.sessionId}/disconnect`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-accounts'] }),
    });

    const resyncMutation = useMutation({
        mutationFn: (clearHistory: boolean) =>
            api.post(`/whatsapp/sessions/${session.sessionId}/resync`, { clearHistory }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-accounts'] }),
    });

    const refreshNamesMutation = useMutation({
        mutationFn: () => api.post(`/whatsapp/sessions/${session.sessionId}/refresh-contacts`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-accounts'] }),
    });

    const [showResyncMenu, setShowResyncMenu] = useState(false);

    const deleteMutation = useMutation({
        mutationFn: () => api.delete(`/whatsapp/sessions/${session.sessionId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-accounts'] }),
    });

    const toggleBotMutation = useMutation({
        mutationFn: (isKnowledgeBot: boolean) => 
            api.patch(`/whatsapp/sessions/${session.sessionId}/knowledge-bot`, { isKnowledgeBot }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-accounts'] })
    });

    const statusConfig = {
        CONNECTED: { color: 'text-green-600', bg: 'bg-green-50 border-green-200', icon: <Wifi size={14} />, label: 'Connected' },
        CONNECTING: { color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', icon: <Loader2 size={14} className="animate-spin" />, label: 'Connecting…' },
        NEEDS_SCAN: { color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: <Smartphone size={14} />, label: 'Scan QR to link' },
        DISCONNECTED: { color: 'text-zinc-500', bg: 'bg-zinc-50 border-zinc-200', icon: <WifiOff size={14} />, label: 'Disconnected' },
    }[session.status] ?? { color: 'text-zinc-500', bg: 'bg-zinc-50 border-zinc-200', icon: <WifiOff size={14} />, label: session.status };

    return (
        <div className="card flex items-center gap-4">
            {/* Avatar */}
            <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${session.status === 'CONNECTED' ? 'bg-green-100 text-green-600' : 'bg-surface-elevated text-muted'
                }`}>
                {session.status === 'CONNECTED' ? <CheckCircle2 size={22} /> : <Smartphone size={22} />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-primary truncate">{session.name}</p>
                <p className="text-xs text-secondary">{session.phoneNumber || 'No number yet'}</p>
            </div>

            {/* Status pill */}
            <button
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 ${session.status === 'NEEDS_SCAN' ? 'hover:brightness-95 cursor-pointer ' : ''} rounded-full border ${statusConfig.bg} ${statusConfig.color}`}
                onClick={() => {
                    if (session.status === 'NEEDS_SCAN') {
                        onOpenQR(session);
                    }
                }}
                disabled={session.status !== 'NEEDS_SCAN'}
            >
                {statusConfig.icon} {statusConfig.label}
            </button>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
                {session.status === 'DISCONNECTED' && (
                    <button
                        title="Reconnect"
                        className="btn btn-sm bg-transparent border border-surface-elevated text-secondary hover:text-primary"
                        onClick={() => onReconnect(session)}
                    >
                        <RefreshCw size={14} />
                    </button>
                )}
                {session.status === 'CONNECTED' && (
                    <>
                        {/* Resync dropdown */}
                        <div className="relative">
                            <button
                                title="Resync options"
                                className="btn btn-sm bg-transparent border border-surface-elevated text-secondary hover:text-primary"
                                onClick={() => setShowResyncMenu(v => !v)}
                                disabled={resyncMutation.isPending}
                            >
                                {resyncMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            </button>
                            {showResyncMenu && (
                                <div
                                    className="absolute right-0 top-9 z-20 bg-surface border border-theme rounded-xl shadow-xl w-56 overflow-hidden"
                                    onMouseLeave={() => setShowResyncMenu(false)}
                                >
                                    <button
                                        className="w-full text-left px-4 py-3 text-sm text-primary hover:bg-hover transition-colors flex flex-col gap-0.5"
                                        onClick={() => { setShowResyncMenu(false); resyncMutation.mutate(false); }}
                                    >
                                        <span className="font-medium">Quick Resync</span>
                                        <span className="text-xs text-muted">Bounce connection &amp; fetch missed messages</span>
                                    </button>
                                    <div className="border-t border-theme" />
                                    <button
                                        className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex flex-col gap-0.5"
                                        onClick={() => {
                                            setShowResyncMenu(false);
                                            if (confirm('This will delete ALL saved messages and conversations for this account, then re-download them fresh from WhatsApp. Continue?')) {
                                                resyncMutation.mutate(true);
                                            }
                                        }}
                                    >
                                        <span className="font-medium">Fresh Resync</span>
                                        <span className="text-xs text-red-400/70">Clear history &amp; re-download everything</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            title="Disconnect"
                            className="btn btn-sm bg-transparent border border-surface-elevated text-secondary hover:text-red-500"
                            onClick={() => disconnectMutation.mutate()}
                            disabled={disconnectMutation.isPending}
                        >
                            <Unplug size={14} />
                        </button>
                        {/* Refresh contact names */}
                        <button
                            title="Refresh contact names"
                            className="btn btn-sm bg-transparent border border-surface-elevated text-secondary hover:text-blue-400"
                            onClick={() => refreshNamesMutation.mutate()}
                            disabled={refreshNamesMutation.isPending}
                        >
                            {refreshNamesMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={12} />}
                        </button>
                    </>
                )}
                <button
                    title="Remove account"
                    className="btn btn-sm bg-transparent border border-surface-elevated text-secondary hover:text-red-500"
                    onClick={() => {
                        if (confirm(`Remove "${session.name}"? This will log out the device and delete all session data.`)) {
                            deleteMutation.mutate();
                        }
                    }}
                    disabled={deleteMutation.isPending}
                >
                    {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>

                <div className="border-l border-theme h-6 mx-2 hidden sm:block"></div>

                <div 
                    onClick={() => {
                        if (!toggleBotMutation.isPending) {
                            toggleBotMutation.mutate(!session.isKnowledgeBot)
                        }
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all border ${session.isKnowledgeBot ? 'bg-primary/10 border-primary/30 text-primary shadow-sm' : 'bg-surface border-theme text-secondary hover:bg-hover'}`}
                    title="Toggle Product Knowledge Bot"
                >
                    <Brain size={15} className={session.isKnowledgeBot ? "text-primary" : "text-muted"} />
                    <span className="text-xs font-semibold tracking-tight select-none mt-[1px]">Knowledge Bot</span>
                    <div className="relative ml-1 flex items-center">
                        <div className={`w-7 h-4 rounded-full transition-colors ${session.isKnowledgeBot ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'}`}></div>
                        <div className={`absolute left-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${session.isKnowledgeBot ? 'translate-x-3' : 'translate-x-0'}`}></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export function WhatsAppTab() {
    const qc = useQueryClient();
    const [showAddModal, setShowAddModal] = useState(false);
    const [connectingSession, setConnectingSession] = useState<WASession | null>(null);

    const { data: sessions = [], isLoading } = useQuery<WASession[]>({
        queryKey: ['wa-accounts'],
        queryFn: () => api.get('/whatsapp/sessions').then(r => r.data?.data ?? []),
        refetchInterval: 4000,
    });

    const handleReconnect = async (session: WASession) => {
        await api.post(`/whatsapp/sessions/${session.sessionId}/connect`);
        qc.invalidateQueries({ queryKey: ['wa-accounts'] });
        setConnectingSession(session);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    return (
        <>
            {showAddModal && (
                <AddAccountModal
                    onClose={() => {
                        setShowAddModal(false);
                        qc.invalidateQueries({ queryKey: ['wa-accounts'] });
                    }}
                    onCreated={(session) => {
                        setConnectingSession(session);
                    }}
                />
            )}
            {connectingSession && (
                <QRModal session={connectingSession} onClose={() => {
                    setConnectingSession(null);
                    qc.invalidateQueries({ queryKey: ['wa-accounts'] });
                }} />
            )}

            <div className="max-w-2xl flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-primary flex items-center gap-2">
                            <MonitorSmartphone className="text-blue-500" />
                            Connected Accounts
                        </h3>
                        <p className="text-sm text-secondary mt-1">
                            Each salesperson or team can connect their own WhatsApp number.
                        </p>
                    </div>
                    <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowAddModal(true)}>
                        <Plus size={16} /> Add Account
                    </button>
                </div>

                {/* Account list */}
                {sessions.length === 0 ? (
                    <div className="card border-dashed border-2 bg-transparent flex flex-col items-center justify-center py-16 gap-4">
                        <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Smartphone size={32} />
                        </div>
                        <div className="text-center">
                            <h4 className="font-semibold text-primary">No Accounts Connected</h4>
                            <p className="text-sm text-muted mt-1 max-w-xs">
                                Click &quot;Add Account&quot; to link a WhatsApp number to this workspace.
                            </p>
                        </div>
                        <button className="btn btn-primary mt-2" onClick={() => setShowAddModal(true)}>
                            <Plus size={16} /> Add Account
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {sessions.map(session => (
                            <SessionCard
                                key={session.sessionId}
                                session={session}
                                onReconnect={(s) => {
                                    setConnectingSession(s);
                                    handleReconnect(s);
                                }}
                                onOpenQR={(s) => {
                                    setConnectingSession(s);
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Auto-open QR for sessions that are in NEEDS_SCAN state */}
                {!connectingSession && sessions.find(s => s.status === 'NEEDS_SCAN') && (
                    <div className="text-xs text-secondary text-center">
                        One or more accounts are waiting for QR scan. Click the account&apos;s reconnect button to open the QR code.
                    </div>
                )}
            </div>
        </>
    );
}
