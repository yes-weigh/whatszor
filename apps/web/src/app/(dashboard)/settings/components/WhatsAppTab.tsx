'use client';

import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
    Smartphone, CheckCircle2, MonitorSmartphone, Unplug,
    Loader2, Plus, Trash2, Wifi, WifiOff, RefreshCw, X, Brain, Edit2,
    AlertTriangle, RefreshCcw, UserCheck, UserX, ChevronDown
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ── Types ──────────────────────────────────────────────────────────────────

interface WASession {
    id: string;
    sessionId: string;
    name: string;
    phoneNumber: string | null;
    // Backend may return QR_PENDING (DB enum) — normalised to NEEDS_SCAN in mapSession()
    status: 'DISCONNECTED' | 'CONNECTING' | 'NEEDS_SCAN' | 'CONNECTED' | 'QR_PENDING';
    qrCode?: string;
    isKnowledgeBot: boolean;
    userId: string | null;
    assignedUser: { name: string; email: string } | null;
}

/** Normalise raw API session shape → WASession */
function mapSession(raw: any): WASession {
    return {
        ...raw,
        // Backend returns QR_PENDING; frontend uses NEEDS_SCAN
        status: raw.status === 'QR_PENDING' ? 'NEEDS_SCAN' : raw.status,
    };
}

// ── QR Modal ───────────────────────────────────────────────────────────────

function QRModal({ session, onClose }: { session: WASession; onClose: () => void }) {
    const qc = useQueryClient();

    // Poll this single session's status while modal is open
    // NOTE: api.ts interceptor unwraps { success, data } → r.data IS the payload
    const { data } = useQuery<WASession>({
        queryKey: ['wa-accounts', session.sessionId],
        queryFn: () => api.get(`/whatsapp/sessions/${session.sessionId}/status`).then(r => mapSession(r.data)),
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

                {/* DISCONNECTED / CONNECTING — show while socket is booting */}
                {(live.status === 'DISCONNECTED' || live.status === 'CONNECTING') && (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <Loader2 size={40} className="animate-spin text-primary" />
                        <p className="text-sm text-secondary text-center">
                            {live.status === 'DISCONNECTED'
                                ? 'Starting up connection…'
                                : 'Initialising connection with WhatsApp servers…'}
                        </p>
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
        mutationFn: (n: string) => api.post('/whatsapp/sessions', { name: n }).then(r => mapSession(r.data)),
        onSuccess: async (account) => {
            // Immediately start the connection (fire and forget)
            api.post(`/whatsapp/sessions/${account.sessionId}/connect`).catch(() => {});
            qc.invalidateQueries({ queryKey: ['wa-accounts'] });
            onCreated(account);
            onClose();
        },
        onError: (e: any) => {
            alert(e.response?.data?.error?.message || e.response?.data?.message || JSON.stringify(e.response?.data) || 'Failed to create account');
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

function SessionCard({
    session, onReconnect, onOpenQR, members, canAssign
}: {
    session: WASession;
    onReconnect: (s: WASession) => void;
    onOpenQR: (s: WASession) => void;
    members: any[];
    canAssign: boolean;
}) {
    const qc = useQueryClient();
    const [isEditingName, setIsEditingName] = useState(false);
    const [editName, setEditName] = useState(session.name);

    const renameMutation = useMutation({
        mutationFn: (newName: string) => api.patch(`/whatsapp/sessions/${session.sessionId}`, { name: newName }),
        onSuccess: () => {
             qc.invalidateQueries({ queryKey: ['wa-accounts'] });
             setIsEditingName(false);
        }
    });

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

    const [showAssignMenu, setShowAssignMenu] = useState(false);
    const [showResyncMenu, setShowResyncMenu] = useState(false);

    const assignMutation = useMutation({
        mutationFn: (targetUserId: string | null) =>
            api.post(`/whatsapp/sessions/${session.sessionId}/transfer`, { targetUserId }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['wa-accounts'] });
            setShowAssignMenu(false);
        },
        onError: (e: any) => {
            alert(e.response?.data?.message || 'Failed to assign session');
            setShowAssignMenu(false);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => api.delete(`/whatsapp/sessions/${session.sessionId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-accounts'] }),
    });

    const toggleBotMutation = useMutation({
        mutationFn: (isKnowledgeBot: boolean) => 
            api.patch(`/whatsapp/sessions/${session.sessionId}/knowledge-bot`, { isKnowledgeBot }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-accounts'] })
    });

    const normalStatus = session.status === 'QR_PENDING' ? 'NEEDS_SCAN' : session.status;
    const statusConfig = {
        CONNECTED: { color: 'text-green-600', bg: 'bg-green-50 border-green-200', icon: <Wifi size={14} />, label: 'Connected' },
        CONNECTING: { color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', icon: <Loader2 size={14} className="animate-spin" />, label: 'Connecting…' },
        NEEDS_SCAN: { color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: <Smartphone size={14} />, label: 'Scan QR to link' },
        DISCONNECTED: { color: 'text-zinc-500', bg: 'bg-zinc-50 border-zinc-200', icon: <WifiOff size={14} />, label: 'Disconnected' },
    }[normalStatus] ?? { color: 'text-zinc-500', bg: 'bg-zinc-50 border-zinc-200', icon: <WifiOff size={14} />, label: session.status };

    return (
        <div className={`relative ${showAssignMenu ? 'z-20' : 'z-0'}`}>
        <div className="card flex items-center gap-4 flex-wrap">
            {/* Avatar */}
            <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${session.status === 'CONNECTED' ? 'bg-green-100 text-green-600' : 'bg-surface-elevated text-muted'
                }`}>
                {session.status === 'CONNECTED' ? <CheckCircle2 size={22} /> : <Smartphone size={22} />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-[120px]">
                {isEditingName ? (
                    <div className="flex items-center gap-1.5 mb-0.5 w-full">
                        <input
                            autoFocus
                            title="New account name"
                            placeholder="Account name"
                            className="input text-sm py-0.5 px-2 h-7 flex-1 min-w-[60px] max-w-[200px]"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') renameMutation.mutate(editName);
                                if (e.key === 'Escape') {
                                    setEditName(session.name);
                                    setIsEditingName(false);
                                }
                            }}
                            disabled={renameMutation.isPending}
                        />
                        {renameMutation.isPending ? (
                            <Loader2 size={14} className="animate-spin text-secondary flex-shrink-0" />
                        ) : (
                            <>
                                <button title="Save" className="text-green-500 hover:text-green-600 transition-colors flex-shrink-0" onClick={() => renameMutation.mutate(editName)}>
                                    <CheckCircle2 size={16} />
                                </button>
                                <button title="Cancel" className="text-secondary hover:text-red-500 transition-colors flex-shrink-0" onClick={() => {
                                    setEditName(session.name);
                                    setIsEditingName(false);
                                }}>
                                    <X size={16} />
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 group mb-0.5 w-full">
                        <p className="font-semibold text-primary truncate max-w-[calc(100%-20px)]">{session.name}</p>
                        <button
                            title="Rename account"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-secondary hover:text-primary flex-shrink-0"
                            onClick={() => {
                                setEditName(session.name);
                                setIsEditingName(true);
                            }}
                        >
                            <Edit2 size={12} />
                        </button>
                    </div>
                )}
                <p className="text-xs text-secondary truncate w-full">{session.phoneNumber || 'No number yet'}</p>
                {/* Assigned member badge */}
                {session.assignedUser ? (
                    <div className="flex items-center gap-1 mt-1">
                        <UserCheck size={11} className="text-green-500 shrink-0" />
                        <span className="text-xs text-green-600 font-medium truncate">{session.assignedUser.name}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 mt-1">
                        <UserX size={11} className="text-muted shrink-0" />
                        <span className="text-xs text-muted">Unassigned</span>
                    </div>
                )}
            </div>

            {/* Status pill */}
            <button
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 ${session.status === 'NEEDS_SCAN' ? 'hover:brightness-95 cursor-pointer ' : ''} rounded-full border flex-shrink-0 ${statusConfig.bg} ${statusConfig.color}`}
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
            <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end ml-auto">
                {/* Assign to Member — owner/admin only */}
                {canAssign && (
                    <div className="relative">
                        <button
                            title="Assign to member"
                            className={`btn btn-sm flex items-center gap-1.5 border ${
                                session.assignedUser
                                    ? 'border-green-500/40 text-green-600 bg-green-50 hover:bg-green-100'
                                    : 'border-surface-elevated text-secondary bg-transparent hover:text-primary'
                            }`}
                            onClick={() => setShowAssignMenu(v => !v)}
                            disabled={assignMutation.isPending}
                        >
                            {assignMutation.isPending
                                ? <Loader2 size={13} className="animate-spin" />
                                : <UserCheck size={13} />}
                            <span className="text-xs">{session.assignedUser ? session.assignedUser.name : 'Assign'}</span>
                            <ChevronDown size={11} />
                        </button>
                        {showAssignMenu && (
                            <div
                                className="absolute left-0 sm:right-0 sm:left-auto top-9 z-30 bg-surface border border-theme rounded-xl shadow-xl w-56 overflow-hidden"
                                onMouseLeave={() => setShowAssignMenu(false)}
                            >
                                <p className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide border-b border-theme">Assign to member</p>
                                {members.filter((m: any) => m.role !== 'OWNER').map((m: any) => (
                                    <button
                                        key={m.id}
                                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-hover transition-colors flex items-center gap-2 ${
                                            session.userId === m.userId ? 'text-green-600 font-semibold' : 'text-primary'
                                        }`}
                                        onClick={() => assignMutation.mutate(m.userId)}
                                    >
                                        <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0">
                                            {m.user?.name?.charAt(0)?.toUpperCase() ?? '?'}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="truncate">{m.user?.name}</span>
                                            <span className="text-xs text-muted truncate">{m.role}</span>
                                        </div>
                                        {session.userId === m.userId && <CheckCircle2 size={13} className="ml-auto text-green-500 shrink-0" />}
                                    </button>
                                ))}
                                {members.filter((m: any) => m.role !== 'OWNER').length === 0 && (
                                    <p className="px-4 py-3 text-xs text-muted">No members to assign to</p>
                                )}
                                {session.userId && (
                                    <>
                                        <div className="border-t border-theme" />
                                        <button
                                            className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                            onClick={() => assignMutation.mutate('__unassign__')}
                                        >
                                            <UserX size={13} /> Unassign
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

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
                                    className="absolute left-0 sm:right-0 sm:left-auto top-9 z-20 bg-surface border border-theme rounded-xl shadow-xl w-56 overflow-hidden"
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
        </div>
    );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export function WhatsAppTab() {
    const qc = useQueryClient();
    const [showAddModal, setShowAddModal] = useState(false);
    const [connectingSession, setConnectingSession] = useState<WASession | null>(null);
    const hasPermission = useAuthStore(s => s.hasPermission);
    const canAssign = hasPermission('members:manage'); // owners and admins

    const { data: sessions = [], isLoading } = useQuery<WASession[]>({
        queryKey: ['wa-accounts'],
        // api.ts interceptor already unwraps → r.data IS the array
        queryFn: () => api.get('/whatsapp/sessions').then(r => (Array.isArray(r.data) ? r.data : []).map(mapSession)),
        refetchInterval: 4000,
    });

    // Fetch workspace members so we can populate the assign dropdown
    const { data: members = [] } = useQuery({
        queryKey: ['workspace-members'],
        queryFn: () => api.get('/workspaces/me/members').then(r => r.data ?? []),
        enabled: canAssign, // only fetch if the user can manage members
    });

    const handleReconnect = async (session: WASession) => {
        await api.post(`/whatsapp/sessions/${session.sessionId}/connect`);
        qc.invalidateQueries({ queryKey: ['wa-accounts'] });
        setConnectingSession(session);
    };

    // ── Bulk danger-zone states ────────────────────────────────
    const [isFlushing, setIsFlushing] = useState(false);
    const [isResyncingAll, setIsResyncingAll] = useState(false);
    const [bulkResult, setBulkResult] = useState<string | null>(null);

    const handleFlushAll = async () => {
        if (!confirm(
            '⚠️ DANGER: This will permanently delete ALL conversations, messages, and contact names for EVERY connected WhatsApp session, then re-download them fresh.\n\nThis cannot be undone. Continue?'
        )) return;

        setIsFlushing(true);
        setBulkResult(null);
        let done = 0;
        try {
            for (const s of sessions) {
                await api.post(`/whatsapp/sessions/${s.sessionId}/resync`, { clearHistory: true });
                done++;
            }
            setBulkResult(`✅ Flushed & resyncing ${done} session(s). Fresh data will appear within a few minutes.`);
            qc.invalidateQueries({ queryKey: ['wa-accounts'] });
        } catch {
            setBulkResult(`⚠️ Completed ${done}/${sessions.length} sessions before an error. Some sessions may still be syncing.`);
        } finally {
            setIsFlushing(false);
        }
    };

    const handleResyncAll = async () => {
        if (!confirm('Quick-resync all connected sessions? This will bounce each connection to pick up any missed messages.')) return;

        setIsResyncingAll(true);
        setBulkResult(null);
        let done = 0;
        try {
            for (const s of sessions.filter(s => s.status === 'CONNECTED')) {
                await api.post(`/whatsapp/sessions/${s.sessionId}/resync`, { clearHistory: false });
                done++;
            }
            setBulkResult(`✅ Resync started for ${done} connected session(s).`);
            qc.invalidateQueries({ queryKey: ['wa-accounts'] });
        } catch {
            setBulkResult(`⚠️ Completed ${done} sessions before an error.`);
        } finally {
            setIsResyncingAll(false);
        }
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
                                members={members as any[]}
                                canAssign={canAssign}
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

                {/* Auto-open QR hint */}
                {!connectingSession && sessions.find(s => s.status === 'NEEDS_SCAN') && (
                    <div className="text-xs text-secondary text-center">
                        One or more accounts are waiting for QR scan. Click the account&apos;s reconnect button to open the QR code.
                    </div>
                )}

                {/* ── Danger Zone ───────────────────────────────── */}
                {sessions.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-5 flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className="text-red-400 shrink-0" />
                            <div>
                                <h4 className="font-semibold text-red-400 text-sm">Danger Zone</h4>
                                <p className="text-xs text-muted mt-0.5">These actions affect <strong>all sessions</strong> and cannot be undone.</p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            {/* Resync All */}
                            <div className="flex-1 bg-surface rounded-xl border border-theme p-4 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <RefreshCcw size={15} className="text-blue-400" />
                                    <span className="text-sm font-semibold text-primary">Resync All Sessions</span>
                                </div>
                                <p className="text-xs text-muted">Bounce all connected WhatsApp sockets to pull any missed messages. Chat history is preserved.</p>
                                <button
                                    className="btn btn-sm mt-1 self-start border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 bg-transparent"
                                    onClick={handleResyncAll}
                                    disabled={isResyncingAll || isFlushing || sessions.filter(s => s.status === 'CONNECTED').length === 0}
                                >
                                    {isResyncingAll ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                                    {isResyncingAll ? 'Resyncing…' : `Resync ${sessions.filter(s => s.status === 'CONNECTED').length} connected`}
                                </button>
                            </div>

                            {/* Flush All */}
                            <div className="flex-1 bg-surface rounded-xl border border-red-500/30 p-4 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <Trash2 size={15} className="text-red-400" />
                                    <span className="text-sm font-semibold text-red-400">Flush All Chats</span>
                                </div>
                                <p className="text-xs text-muted">Delete <strong>all conversations &amp; messages</strong> for every session, then re-download fresh from WhatsApp.</p>
                                <button
                                    className="btn btn-sm mt-1 self-start border border-red-500/40 text-red-400 hover:bg-red-500/10 bg-transparent"
                                    onClick={handleFlushAll}
                                    disabled={isFlushing || isResyncingAll || sessions.length === 0}
                                >
                                    {isFlushing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    {isFlushing ? 'Flushing…' : 'Flush & Resync All'}
                                </button>
                            </div>
                        </div>

                        {/* Result feedback */}
                        {bulkResult && (
                            <p className="text-xs text-secondary bg-surface px-3 py-2 rounded-lg border border-theme">{bulkResult}</p>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
