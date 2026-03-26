'use client';

import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useRealtimeEvents } from '@/hooks/use-realtime-events';
import { useQuickReplies } from '@/hooks/use-quick-replies';
import {
    MessageSquare, Search, Send, Phone, CheckCheck, Check,
    Smartphone, ChevronDown, X, Loader2, Circle, Download, FileText, Zap,
    Paperclip, PenSquare, FileImage, Sparkles
} from 'lucide-react';
import TemplatePickerModal from './TemplatePickerModal';


// ── Types ────────────────────────────────────────────────────

interface WaAccount {
    id: string;
    sessionId: string;
    name: string;
    phoneNumber: string | null;
    status: string;
}

interface Contact {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
}

interface Conversation {
    id: string;
    providerId: string;
    phone: string | null;        // parsed from JID by backend; null for LID-based conversations
    contactName: string | null;  // CRM contact name or WA contact name
    waContactName: string | null; // WhatsApp pushName (contact's own name)
    sessionId: string | null;    // which WA account sourced this chat
    status: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    unreadCount: number;
    contact: Contact | null;
}

interface Message {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    type: string;
    content: string | null;
    status: string;
    createdAt: string;
    senderUserId: string | null;
    mediaData?: {
        localPath?: string;
        mimeType?: string;
        fileSize?: number;
        fileName?: string;
    } | null;
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * useBlobUrl — loads media for display.
 *
 * Two modes:
 *  1. `hasLocalPath: true`  → GET /media/:id immediately (file already on disk)
 *  2. `hasLocalPath: false` → waits for `triggerDownload()` call, then POST /media/:id/download
 *
 * Returns a blob URL, loading state, error state, and a `triggerDownload` function.
 */
function useBlobUrl(messageId: string | null, hasLocalPath: boolean) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [triggered, setTriggered] = useState(false);

    // Auto-fetch when the file is already on disk
    useEffect(() => {
        if (!messageId || !hasLocalPath) return;
        let objectUrl: string | null = null;
        let cancelled = false;
        setLoading(true);
        api.get(`/media/${messageId}`, { responseType: 'blob' })
            .then(r => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(r.data as Blob);
                setBlobUrl(objectUrl);
            })
            .catch(() => { if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [messageId, hasLocalPath]);

    // On-demand download — triggered by user clicking the Load button
    useEffect(() => {
        if (!messageId || !triggered || hasLocalPath) return;
        let objectUrl: string | null = null;
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        api.post(`/media/${messageId}/download`, {}, { responseType: 'blob' })
            .then(r => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(r.data as Blob);
                setBlobUrl(objectUrl);
            })
            .catch(() => { if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [messageId, triggered, hasLocalPath]);

    const triggerDownload = () => setTriggered(true);

    return { blobUrl, loading, failed, triggerDownload };
}

function formatFileSize(bytes?: number) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getInitial(name: string) {
    return name.trim().charAt(0).toUpperCase();
}

const ACCOUNT_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
];
function accountColor(idx: number) {
    return ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
}

// ── ContactAvatar: loads WA profile picture lazily ──────────

// Global profile picture cache — persists across re-renders, avoids duplicate requests
const profilePicCache = new Map<string, string | null>();

function ContactAvatar({ jid, name, sizeClass = 'w-10 h-10 text-base', delay = 0 }: {
    jid: string; name: string; sizeClass?: string; delay?: number;
}) {
    const [imgUrl, setImgUrl] = useState<string | null | undefined>(
        profilePicCache.has(jid) ? profilePicCache.get(jid)! : undefined
    );

    useEffect(() => {
        // Already cached — no need to fetch
        if (profilePicCache.has(jid)) {
            setImgUrl(profilePicCache.get(jid) ?? null);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled) return;
            try {
                const r = await api.get('/conversations/profile-picture', { params: { jid } });
                const url = r.data?.data ?? null;
                profilePicCache.set(jid, url);
                if (!cancelled) setImgUrl(url);
            } catch {
                profilePicCache.set(jid, null); // cache failure too to avoid retries
            }
        }, delay);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [jid, delay]);

    const initials = getInitial(name);
    const colorIdx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const bg = ACCOUNT_COLORS[colorIdx % ACCOUNT_COLORS.length];

    if (imgUrl) {
        return <img src={imgUrl} alt={name}
            className={`${sizeClass} rounded-full object-cover shrink-0`} />;
    }
    return (
        <div className={`${bg} ${sizeClass} rounded-full shrink-0 flex items-center justify-center text-white font-semibold select-none text-sm`}>
            {initials}
        </div>
    );
}

// Detect WhatsApp LIDs (internal IDs, not real phone numbers).
// Real E.164 phone numbers max out at 15 digits, but in practice are ≤13.
// Anything 14+ digits with no contact name is very likely a WhatsApp LID.
function getDisplayName(conv: Conversation): string {
    const crmName = conv.contact
        ? [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(' ').trim() || conv.contact.phone
        : null;

    if (crmName) return crmName;
    if (conv.waContactName) return conv.waContactName;

    // Fallback to phone number or LID label
    const providerId = conv.providerId ?? '';

    // LID JIDs (WhatsApp Business internal IDs) should not be displayed as phone numbers
    if (providerId.endsWith('@lid') || conv.phone === null) {
        return 'WhatsApp Business';
    }

    const phone = conv.phone ?? providerId.replace(/\D/g, '');
    return phone ? `+${phone}` : 'Unknown';
}

// ── Sub-components ───────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
    if (status === 'READ') return <CheckCheck size={13} className="text-blue-400" />;
    if (status === 'PLAYED') return <CheckCheck size={13} className="text-blue-400" />;
    if (status === 'DELIVERED') return <CheckCheck size={13} className="text-muted" />;
    if (status === 'SENT') return <Check size={13} className="text-muted" />;
    if (status === 'SUGGESTED') return <Sparkles size={11} className="text-secondary animate-pulse" />;
    return null;
}

function MessageBubble({ msg, onApprove, onEdit, onGenerateReply, isLastInbound }: { 
    msg: Message; 
    onApprove: (id: string) => void; 
    onEdit: (text: string) => void;
    onGenerateReply?: () => void;
    isLastInbound?: boolean;
}) {
    const isOut = msg.direction === 'OUTBOUND';
    const isMediaType = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER'].includes(msg.type);
    const hasLocalPath = !!msg.mediaData?.localPath;
    const { blobUrl, loading, failed, triggerDownload } = useBlobUrl(
        isMediaType ? msg.id : null,
        hasLocalPath
    );

    function renderContent() {
        // If we have a blob URL, render the appropriate media element
        if (blobUrl) {
            if (msg.type === 'IMAGE' || msg.type === 'STICKER') {
                return (
                    <img
                        src={blobUrl}
                        alt="Image"
                        className="max-w-[260px] max-h-[260px] rounded-lg object-contain cursor-pointer"
                        loading="lazy"
                    />
                );
            }
            if (msg.type === 'VIDEO') {
                return (
                    <video
                        src={blobUrl}
                        controls
                        className="max-w-[280px] rounded-lg"
                        preload="metadata"
                    />
                );
            }
            if (msg.type === 'AUDIO') {
                return (
                    <audio
                        src={blobUrl}
                        controls
                        className="w-[240px] h-10"
                        preload="metadata"
                    />
                );
            }
            if (msg.type === 'DOCUMENT') {
                const fileName = msg.mediaData?.fileName || msg.content || 'Document';
                return (
                    <a
                        href={blobUrl}
                        download={fileName}
                        className="flex items-center gap-2 text-sm underline underline-offset-2"
                    >
                        <FileText size={16} />
                        <span>{fileName}</span>
                        <span className="text-xs opacity-60">{formatFileSize(msg.mediaData?.fileSize)}</span>
                        <Download size={14} />
                    </a>
                );
            }
        }

        // Spinner while fetching from disk or downloading on-demand
        if (loading) {
            return <Loader2 size={18} className="animate-spin opacity-50" />;
        }

        // Text messages
        if (msg.content && !isMediaType) return <span>{msg.content}</span>;
        if (msg.content && isMediaType && !hasLocalPath) {
            // text caption for a media that hasn't been fetched yet — show below button
        }

        // Media with no localPath yet — show a Load button the user can tap
        if (isMediaType && !blobUrl) {
            const labels: Record<string, string> = {
                IMAGE: '🖼️ Image', VIDEO: '🎬 Video', AUDIO: '🎙️ Voice message',
                DOCUMENT: '📄 Document', STICKER: '😄 Sticker',
            };
            const label = labels[msg.type] ?? 'Media';

            if (failed) {
                return (
                    <span className="italic text-xs opacity-50">{label} · Expired</span>
                );
            }

            return (
                <button
                    onClick={triggerDownload}
                    className="flex items-center gap-2 text-xs opacity-75 hover:opacity-100 transition-opacity cursor-pointer"
                >
                    <Download size={14} />
                    <span>{label}</span>
                    <span className="underline underline-offset-2">Load</span>
                </button>
            );
        }

        // Plain text fallback (text messages that slipped through)
        if (msg.content) return <span>{msg.content}</span>;
        return <span className="italic text-xs opacity-50">Empty message</span>;
    }

    return (
        <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} group`}>
            <div className={`max-w-[70%] flex flex-col gap-1 ${isOut ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    isOut
                        ? msg.status === 'SUGGESTED'
                            ? 'bg-elevated text-primary border-2 border-dashed border-secondary/40 rounded-[18px_4px_18px_18px]'
                            : 'bg-[hsl(235,85%,58%)] text-white rounded-[18px_4px_18px_18px]'
                        : 'bg-elevated text-primary border border-theme rounded-[4px_18px_18px_18px]'
                }`}>
                    {msg.status === 'SUGGESTED' && (
                        <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-theme/50 text-[10px] font-bold uppercase tracking-wider text-secondary">
                            <Sparkles size={10} />
                            <span>AI Suggestion</span>
                        </div>
                    )}
                    {renderContent()}
                </div>
                <div className="flex items-center gap-1 px-1">
                    <span className="text-[11px] text-muted">
                        {format(new Date(msg.createdAt), 'HH:mm')}
                    </span>
                    {isOut && <StatusIcon status={msg.status} />}
                </div>

                {msg.status === 'SUGGESTED' && (
                    <div className="flex items-center gap-2 mt-1">
                        <button
                            onClick={() => onApprove(msg.id)}
                            className="text-[10px] font-bold px-2 py-1 rounded bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors uppercase"
                        >
                            Send
                        </button>
                        <button
                            onClick={() => onEdit(msg.content || '')}
                            className="text-[10px] font-bold px-2 py-1 rounded bg-muted/10 text-muted hover:bg-muted/20 transition-colors uppercase"
                        >
                            Edit
                        </button>
                    </div>
                )}
                
                {isLastInbound && onGenerateReply && (
                    <div className="flex items-center gap-2 mt-1">
                        <button
                            onClick={onGenerateReply}
                            className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded bg-primary/5 text-primary hover:bg-primary/10 transition-colors uppercase border border-theme"
                        >
                            <Sparkles size={10} className="text-secondary" />
                            Generate AI Reply
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────

export default function ConversationsPage() {
    const router = useRouter();
    const { hasPermission } = useAuthStore();
    const qc = useQueryClient();
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null); // null = All
    const [search, setSearch] = useState('');
    const [replyText, setReplyText] = useState('');
    const [replySession, setReplySession] = useState<string | null>(null);
    const [showSessionPicker, setShowSessionPicker] = useState(false);
    const [showQuickReplies, setShowQuickReplies] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [showNewChat, setShowNewChat] = useState(false);
    const [newChatSearch, setNewChatSearch] = useState('');
    const [attachUploading, setAttachUploading] = useState(false);
    // Media attached from quick reply selection
    const [pendingQrMedia, setPendingQrMedia] = useState<{ id: string; name: string; type: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Role guard: OWNER and ADMIN only ───────────────────────
    useEffect(() => {
        if (!hasPermission('conversations:read')) {
            router.replace('/dashboard');
        }
    }, [hasPermission, router]);


    // ── Data fetching ──────────────────────────────────────

    const { data: accounts = [] } = useQuery<WaAccount[]>({
        queryKey: ['wa-accounts'],
        queryFn: () => api.get('/whatsapp/sessions').then(r => r.data?.data ?? []),
        refetchInterval: 10000,
    });

    const { data: crmContacts = [] } = useQuery<Contact[]>({
        queryKey: ['contacts-picker', newChatSearch],
        queryFn: () => api.get(`/crm/contacts?search=${newChatSearch}&limit=50`).then(r => r.data?.data ?? []),
        enabled: showNewChat,
    });

    const startConversationMutation = useMutation({
        mutationFn: (payload: { contactId?: string; phone: string }) => {
            const cleanPhone = payload.phone.replace(/\D/g, '');
            if (!cleanPhone) throw new Error('Valid phone number required');
            return api.post('/conversations', { 
                provider: 'WHATSAPP',
                providerId: `${cleanPhone}@s.whatsapp.net`,
                contactId: payload.contactId || null
            });
        },
        onSuccess: (res) => {
            const conv = res.data?.data;
            setShowNewChat(false);
            setNewChatSearch('');
            qc.invalidateQueries({ queryKey: ['conversations'] });
            if (conv) openConversation(conv);
        },
    });

    const connectedAccounts = accounts.filter(a => a.status === 'CONNECTED');

    const { data: convsResult, isLoading: convsLoading } = useQuery<{ items: Conversation[] }>({
        queryKey: ['conversations', activeSessionId],
        queryFn: () => {
            const qs = activeSessionId ? `?sessionId=${activeSessionId}` : '';
            return api.get(`/conversations${qs}`).then(r => r.data?.data ?? { items: [] });
        },
        // SSE handles live updates — keep a generous fallback interval for resilience
        refetchInterval: 60_000,
    });

    const convs: Conversation[] = convsResult?.items ?? [];

    const { data: msgsResult, isLoading: msgsLoading } = useQuery<{ items: Message[] }>({
        queryKey: ['messages', selectedConv?.id],
        queryFn: () => selectedConv
            ? api.get(`/conversations/${selectedConv.id}/messages`).then(r => r.data?.data ?? { items: [] })
            : { items: [] },
        enabled: !!selectedConv,
        // SSE handles live updates — no interval polling needed
        refetchOnWindowFocus: true,
    });

    const msgs: Message[] = msgsResult?.items ?? [];

    const { quickReplies, isPending: qrLoading } = useQuickReplies();

    // ── Mark as read ────────────────────────────────────────

    const markRead = useMutation({
        mutationFn: (convId: string) =>
            api.patch(`/conversations/${convId}`, { unreadCount: 0 }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
    });

    // ── Real-time SSE updates ──────────────────────────────
    // onMessageNew: if the event is for the currently open conversation,
    // immediately refetch the message thread. Always refresh the sidebar
    // so unread counts, lastMessage, and sort order stay accurate.
    const selectedConvRef = useRef<Conversation | null>(null);
    selectedConvRef.current = selectedConv;

    useRealtimeEvents({
        onMessageNew: (payload) => {
            // Refresh the active conversation thread if it matches
            if (payload.conversationId && payload.conversationId === selectedConvRef.current?.id) {
                qc.invalidateQueries({ queryKey: ['messages', payload.conversationId] });
            }
            // Always refresh the sidebar conversation list (unread badge, lastMessage, sort)
            qc.invalidateQueries({ queryKey: ['conversations'] });
        },
        onConversationUpdated: (payload) => {
            qc.invalidateQueries({ queryKey: ['conversations'] });
            // If the updated conversation is the open one, also refresh messages
            if (payload.conversationId && payload.conversationId === selectedConvRef.current?.id) {
                qc.invalidateQueries({ queryKey: ['messages', payload.conversationId] });
            }
        },
        onMessageStatus: (payload) => {
            // Refresh messages in the active thread to show updated status tick
            if (payload.conversationId && payload.conversationId === selectedConvRef.current?.id) {
                qc.invalidateQueries({ queryKey: ['messages', payload.conversationId] });
            }
        },
    });

    function openConversation(conv: Conversation) {
        setSelectedConv(conv);
        if (conv.unreadCount > 0) markRead.mutate(conv.id);
        // Default reply session: try to find account that matches the inbound JID context
        setReplySession(connectedAccounts[0]?.sessionId ?? null);
    }

    // ── Send message ────────────────────────────────────────

    const sendMsg = useMutation({
        mutationFn: async () => {
            if (!selectedConv || !replyText.trim()) return;

            // If a quick reply's media is attached, send the media message first
            if (pendingQrMedia) {
                const msgType = pendingQrMedia.type === 'image' ? 'IMAGE' : pendingQrMedia.type === 'video' ? 'VIDEO' : 'DOCUMENT';
                await api.post(`/conversations/${selectedConv.id}/messages`, {
                    type: msgType,
                    mediaGalleryId: pendingQrMedia.id,
                    fileName: pendingQrMedia.name,
                    sessionId: replySession,
                });
            }

            // Then send the text
            return api.post(`/conversations/${selectedConv.id}/messages`, {
                type: 'TEXT',
                content: replyText.trim(),
                sessionId: replySession,
            });
        },
        onSuccess: () => {
            setReplyText('');
            setPendingQrMedia(null);
            qc.invalidateQueries({ queryKey: ['messages', selectedConv?.id] });
            qc.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
    
    const approveMsg = useMutation({
        mutationFn: (messageId: string) => 
            api.post(`/conversations/messages/${messageId}/approve`, { 
                sessionId: replySession 
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['messages', selectedConv?.id] });
            qc.invalidateQueries({ queryKey: ['conversations'] });
        },
    });

    const generateAiReply = useMutation({
        mutationFn: (convId: string) => api.post(`/conversations/${convId}/suggest-reply`),
        // Optimistic UI or just wait for SSE payload to handle the update
    });

    const sendTemplate = useMutation({
        mutationFn: async ({ templateVersionId, variables }: { templateVersionId: string, variables: Record<string, any> }) => {
            if (!selectedConv) return;
            return api.post(`/conversations/${selectedConv.id}/messages`, {
                type: 'TEMPLATE',
                templateVersionId,
                templateVariables: variables,
                sessionId: replySession,
            });
        },
        onSuccess: () => {
            setShowTemplatePicker(false);
            qc.invalidateQueries({ queryKey: ['messages', selectedConv?.id] });
            qc.invalidateQueries({ queryKey: ['conversations'] });
        },
    });

    function handleSend() {
        if (!replyText.trim() || sendMsg.isPending) return;
        sendMsg.mutate();
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    // ── Auto-scroll ───────────────────────────────────────

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [msgs.length]);

    // ── Auto-reset when session disconnects ───────────────
    // If the user was viewing a specific session that just went offline, fall back to "All"
    // If the open conversation belongs to a disconnected session, close it
    useEffect(() => {
        const connectedIds = new Set(accounts.filter(a => a.status === 'CONNECTED' || a.status === 'CONNECTING').map(a => a.sessionId));

        if (activeSessionId && !connectedIds.has(activeSessionId)) {
            setActiveSessionId(null);
        }
        if (selectedConv?.sessionId && !connectedIds.has(selectedConv.sessionId)) {
            setSelectedConv(null);
        }
    }, [accounts]);

    // ── Filtered list ──────────────────────────────────────

    const filtered = convs.filter(c => {
        const name = getDisplayName(c).toLowerCase();
        const last = (c.lastMessage ?? '').toLowerCase();
        const s = search.toLowerCase();
        return !s || name.includes(s) || (c.phone ?? '').includes(s) || last.includes(s);
    });

    // ── Render ─────────────────────────────────────────────

    const replyAccount = connectedAccounts.find(a => a.sessionId === replySession);

    return (
        <div className="flex h-screen overflow-hidden bg-app">

            {/* ── 1. Account Filter Sidebar ──────────────────── */}
            <aside className="w-56 shrink-0 border-r border-theme flex flex-col py-4 px-3 gap-2 bg-surface overflow-y-auto">
                <div className="mb-2 px-2 text-xs font-semibold text-secondary uppercase tracking-wider">
                    WhatsApp Accounts
                </div>

                {/* All chats */}
                <button
                    onClick={() => setActiveSessionId(null)}
                    title="All Chats"
                    className={`w-full h-10 px-2 rounded-xl flex items-center gap-3 transition-all ${activeSessionId === null
                        ? 'bg-accent/10 text-accent font-medium'
                        : 'text-secondary hover:bg-hover hover:text-primary'
                        }`}
                >
                    <div className={`w-6 h-6 rounded flex items-center justify-center ${activeSessionId === null ? 'bg-accent text-white shadow-sm' : 'bg-elevated border border-theme text-muted'}`}>
                         <MessageSquare size={12} />
                    </div>
                    <span>All Chats</span>
                </button>

                {/* Divider */}
                {accounts.length > 0 && <div className="w-full h-px bg-theme my-1" />}

                {/* Per-account buttons */}
                {accounts.map((acc, i) => {
                    const isConnected = acc.status === 'CONNECTED' || acc.status === 'CONNECTING';
                    const active = activeSessionId === acc.sessionId;
                    return (
                        <button
                            key={acc.sessionId}
                            onClick={() => isConnected && setActiveSessionId(acc.sessionId)}
                            title={`${acc.name}${acc.phoneNumber ? ` · ${acc.phoneNumber}` : ''} — ${acc.status}`}
                            disabled={!isConnected}
                            className={`w-full h-12 px-2 rounded-xl flex items-center gap-3 transition-all ${!isConnected ? 'opacity-40 cursor-not-allowed grayscale' :
                                active
                                    ? 'bg-accent/10'
                                    : 'hover:bg-hover'
                                }`}
                        >
                            <div className={`relative w-8 h-8 rounded-lg flex flex-shrink-0 items-center justify-center text-xs font-bold text-white transition-all ${accountColor(i)} ${active ? 'shadow-md scale-105' : ''}`}>
                                {getInitial(acc.name)}
                                {/* Status dot */}
                                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface ${acc.status === 'CONNECTED' ? 'bg-emerald-400' :
                                    acc.status === 'CONNECTING' ? 'bg-yellow-400 animate-pulse' :
                                        'bg-gray-500'
                                    }`} />
                            </div>
                            <div className="flex flex-col items-start overflow-hidden">
                                <span className={`text-sm truncate w-full text-left ${active ? 'text-accent font-semibold' : 'text-primary font-medium'}`}>{acc.name}</span>
                                {acc.phoneNumber && (
                                    <span className={`text-xs truncate w-full text-left ${active ? 'text-accent/70' : 'text-secondary'}`}>{acc.phoneNumber}</span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </aside>

            {/* ── New Chat Contact Picker Modal ─────────────── */}
            {showNewChat && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-surface border border-theme rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-theme">
                            <h2 className="font-bold text-primary">New Chat</h2>
                            <button title="Close" aria-label="Close new chat modal" onClick={() => setShowNewChat(false)}><X size={18} className="text-muted hover:text-primary" /></button>
                        </div>
                        <div className="px-4 py-3 border-b border-theme">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-theme bg-elevated">
                                <Search size={13} className="text-muted" />
                                <input
                                    autoFocus
                                    aria-label="Search contacts or enter phone"
                                    className="bg-transparent text-sm outline-none flex-1 text-primary placeholder:text-muted"
                                    placeholder="Search contacts or type number (e.g. +1...)"
                                    value={newChatSearch}
                                    onChange={e => setNewChatSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-80">
                            {(() => {
                                const cleanSearch = newChatSearch.replace(/[\s-]/g, '');
                                const isPhoneNumber = cleanSearch.length >= 7 && /^\+?\d+$/.test(cleanSearch);
                                const contacts = (crmContacts as Contact[]) || [];
                                
                                return (
                                    <>
                                        {isPhoneNumber && (
                                            <button
                                                onClick={() => startConversationMutation.mutate({ phone: cleanSearch })}
                                                disabled={startConversationMutation.isPending}
                                                className="w-full flex items-center gap-3 px-5 py-3 border-b border-theme hover:bg-hover transition-colors text-left"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                                                    <MessageSquare size={14} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-emerald-500">Chat with {newChatSearch}</p>
                                                    <p className="text-xs text-muted">Send WhatsApp message</p>
                                                </div>
                                            </button>
                                        )}
                                        {!isPhoneNumber && contacts.length === 0 && (
                                            <p className="text-center text-sm text-muted py-8">No contacts found</p>
                                        )}
                                        {contacts.map((c) => (
                                            <button
                                                key={c.id}
                                                onClick={() => {
                                                    if (!c.phone) return alert('Contact has no phone number');
                                                    startConversationMutation.mutate({ contactId: c.id, phone: c.phone });
                                                }}
                                                disabled={startConversationMutation.isPending}
                                                className="w-full flex items-center gap-3 px-5 py-3 border-b border-theme hover:bg-hover transition-colors text-left"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                    {c.firstName?.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-primary">{c.firstName} {c.lastName}</p>
                                                    <p className="text-xs text-muted">{c.phone || '—'}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* hidden file input for media attachment */}
            <input
                ref={fileInputRef}
                type="file"
                aria-hidden="true"
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !selectedConv) return;
                    setAttachUploading(true);
                    try {
                        const fd = new FormData();
                        fd.append('file', file);
                        fd.append('category', file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document');
                        const uploadRes = await api.post('/media-gallery/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                        const mediaUrl = uploadRes.data?.data?.url;
                        if (mediaUrl) {
                            await api.post(`/conversations/${selectedConv.id}/messages`, {
                                type: file.type.startsWith('image/') ? 'IMAGE' : file.type.startsWith('video/') ? 'VIDEO' : 'DOCUMENT',
                                mediaUrl,
                                fileName: file.name,
                                sessionId: replySession,
                            });
                            qc.invalidateQueries({ queryKey: ['messages', selectedConv.id] });
                        }
                    } catch (err) { console.error('Attachment upload failed:', err); }
                    finally { setAttachUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
                }}
            />

            {/* ── 2. Conversation List ────────────────────────── */}
            <aside className="w-72 shrink-0 border-r border-theme flex flex-col bg-surface overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-theme">
                    <div className="flex items-center justify-between mb-2">
                        <h1 className="font-semibold text-primary text-sm">
                            {activeSessionId
                                ? accounts.find(a => a.sessionId === activeSessionId)?.name ?? 'Conversations'
                                : 'All Conversations'}
                        </h1>
                        <button
                            onClick={() => setShowNewChat(true)}
                            title="New Chat"
                            className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors font-medium"
                        >
                            <PenSquare size={13} /> New Chat
                        </button>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-theme bg-elevated">
                        <Search size={13} className="text-muted shrink-0" />
                        <input
                            className="bg-transparent text-sm outline-none flex-1 text-primary placeholder:text-muted"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button title="Clear search" onClick={() => setSearch('')}>
                                <X size={13} className="text-muted hover:text-primary" />
                            </button>
                        )}
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                    {convsLoading && (
                        <div className="flex items-center justify-center p-8">
                            <Loader2 size={20} className="animate-spin text-muted" />
                        </div>
                    )}

                    {!convsLoading && filtered.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                            <MessageSquare size={36} className="text-muted opacity-40" />
                            <p className="text-sm text-muted">No conversations yet</p>
                            <p className="text-xs text-muted opacity-60">Messages from WhatsApp will appear here</p>
                        </div>
                    )}

                    {filtered.map((conv, idx) => {
                        const name = getDisplayName(conv);
                        const isActive = selectedConv?.id === conv.id;

                        return (
                            <button
                                key={conv.id}
                                onClick={() => openConversation(conv)}
                                className={`w-full text-left px-4 py-3 border-b border-theme flex gap-3 items-start transition-colors ${isActive ? 'bg-accent/10' : 'hover:bg-hover'
                                    }`}
                            >
                                {/* Avatar with WA profile picture (staggering requests to prevent rate limit) */}
                                <ContactAvatar jid={conv.providerId} name={name} sizeClass="w-9 h-9 text-sm" delay={idx * 100} />

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold text-primary truncate">
                                            {name}
                                        </p>
                                        <span className="text-[11px] text-muted shrink-0">
                                            {conv.lastMessageAt
                                                ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false })
                                                    .replace('about ', '')
                                                    .replace(' minutes', 'm')
                                                    .replace(' minute', 'm')
                                                    .replace(' hours', 'h')
                                                    .replace(' hour', 'h')
                                                    .replace(' days', 'd')
                                                    .replace(' day', 'd')
                                                : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-1 mt-0.5">
                                        <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-secondary' : 'text-muted'}`}>
                                            {conv.lastMessage ?? 'No messages yet'}
                                        </p>
                                        {conv.unreadCount > 0 && (
                                            <span className="shrink-0 min-w-[18px] h-[18px] px-1 bg-accent rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                                                {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </aside>

            {/* ── 3. Chat Thread ──────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {!selectedConv ? (
                    /* Empty state */
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                        <div className="w-20 h-20 rounded-2xl bg-elevated border border-theme flex items-center justify-center">
                            <MessageSquare size={36} className="text-muted opacity-50" />
                        </div>
                        <div>
                            <p className="font-medium text-primary">Select a conversation</p>
                            <p className="text-sm text-muted mt-1">Choose a chat from the left to start messaging</p>
                        </div>
                        {connectedAccounts.length === 0 && (
                            <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-500/20 px-4 py-2 rounded-lg">
                                No WhatsApp accounts connected. Go to Settings → WhatsApp to connect one.
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="px-5 py-3 border-b border-theme flex items-center justify-between bg-surface shrink-0">
                            <div className="flex items-center gap-3">
                                <ContactAvatar jid={selectedConv.providerId} name={getDisplayName(selectedConv)} sizeClass="w-9 h-9 text-sm" />
                                <div className="flex-1">
                                    <p className="font-semibold text-sm text-primary">
                                        {getDisplayName(selectedConv)}
                                    </p>
                                    <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                                        {selectedConv.phone ? (
                                            <><Phone size={10} />+{selectedConv.phone}</>
                                        ) : (
                                            <><Phone size={10} />WhatsApp Business</>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${selectedConv.status === 'ACTIVE'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-muted/10 text-muted border-theme'
                                    }`}>
                                    {selectedConv.status}
                                </span>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
                            {msgsLoading && (
                                <div className="flex-1 flex items-center justify-center">
                                    <Loader2 size={20} className="animate-spin text-muted" />
                                </div>
                            )}
                            {!msgsLoading && msgs.length === 0 && (
                                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                                    <Circle size={24} className="text-muted opacity-30" />
                                    <p className="text-sm text-muted">No messages yet</p>
                                </div>
                            )}
                            {msgs.map((msg, idx) => {
                                // Find if this is the last inbound message in the thread
                                const isLastInbound = msg.direction === 'INBOUND' && 
                                    msgs.findIndex((m, i) => i > idx && m.direction === 'INBOUND') === -1;
                                
                                return (
                                    <MessageBubble 
                                        key={msg.id} 
                                        msg={msg} 
                                        onApprove={(id) => approveMsg.mutate(id)}
                                        onEdit={(text) => {
                                            setReplyText(text);
                                            textareaRef.current?.focus();
                                        }}
                                        isLastInbound={isLastInbound}
                                        onGenerateReply={selectedConv ? () => {
                                            generateAiReply.mutate(selectedConv.id);
                                        } : undefined}
                                    />
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Reply Box */}
                        <div className="shrink-0 border-t border-theme bg-surface px-4 py-3">
                            {/* Account selector */}
                            {connectedAccounts.length > 1 && (
                                <div className="relative mb-2">
                                    <button
                                        onClick={() => setShowSessionPicker(v => !v)}
                                        className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
                                    >
                                        <Smartphone size={12} />
                                        Reply from: <span className="text-secondary font-medium">
                                            {replyAccount?.name ?? 'Select account'}
                                        </span>
                                        <ChevronDown size={12} />
                                    </button>
                                    {showSessionPicker && (
                                        <div className="absolute bottom-full mb-1 left-0 bg-elevated border border-theme rounded-xl shadow-xl overflow-hidden z-20 w-52">
                                            {connectedAccounts.map((acc, i) => (
                                                <button
                                                    key={acc.sessionId}
                                                    onClick={() => { setReplySession(acc.sessionId); setShowSessionPicker(false); }}
                                                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-hover transition-colors ${replySession === acc.sessionId ? 'text-accent' : 'text-primary'
                                                        }`}
                                                >
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${accountColor(i)}`}>
                                                        {getInitial(acc.name)}
                                                    </span>
                                                    <div>
                                                        <p className="font-medium text-xs">{acc.name}</p>
                                                        <p className="text-[10px] text-muted">{acc.phoneNumber ?? 'Connecting…'}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Input row */}
                            {/* Pending QR media preview pill */}
                            {pendingQrMedia && (
                                <div className="flex items-center gap-2 px-3 py-1.5 mb-1 bg-elevated border border-theme rounded-lg text-xs">
                                    <Paperclip size={12} className="text-accent shrink-0" />
                                    <span className="text-secondary truncate flex-1">{pendingQrMedia.name}</span>
                                    <button
                                        onClick={() => setPendingQrMedia(null)}
                                        title="Remove attachment"
                                        className="text-muted hover:text-red-400 transition-colors shrink-0"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            )}
                            <div className="flex gap-2 items-end relative">
                                {/* Template Trigger */}
                                <button
                                    onClick={() => setShowTemplatePicker(true)}
                                    className="w-10 h-10 rounded-xl bg-elevated border border-theme hover:bg-hover flex items-center justify-center transition-colors text-muted hover:text-accent shrink-0"
                                    title="Send Template"
                                >
                                    <FileImage size={18} />
                                </button>
                                {/* Quick Replies Trigger */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowQuickReplies(v => !v)}
                                        className="w-10 h-10 rounded-xl bg-elevated border border-theme hover:bg-hover flex items-center justify-center transition-colors text-muted hover:text-accent shrink-0"
                                        title="Quick Replies"
                                    >
                                        <Zap size={18} />
                                    </button>

                                    {/* Quick Replies Dropdown */}
                                    {showQuickReplies && (
                                        <div className="absolute bottom-full mb-2 left-0 w-64 bg-elevated border border-theme rounded-xl shadow-xl overflow-hidden z-20 flex flex-col max-h-80">
                                            <div className="px-3 py-2 border-b border-theme bg-surface flex justify-between items-center">
                                                <span className="text-xs font-semibold text-primary">Quick Replies</span>
                                                {qrLoading && <Loader2 size={12} className="animate-spin text-muted" />}
                                                <button onClick={() => setShowQuickReplies(false)} title="Close">
                                                    <X size={14} className="text-muted hover:text-primary" />
                                                </button>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-1">
                                                {!qrLoading && quickReplies.length === 0 && (
                                                    <p className="text-xs text-muted text-center py-4">No quick replies yet.</p>
                                                )}
                                                {quickReplies.map(qr => (
                                                    <button
                                                        key={qr.id}
                                                        onClick={() => {
                                                            setReplyText(qr.content);
                                                            // Attach media from the quick reply if present
                                                            if (qr.media) {
                                                                setPendingQrMedia({ id: qr.media.id, name: qr.media.name, type: qr.media.type });
                                                            } else {
                                                                setPendingQrMedia(null);
                                                            }
                                                            setShowQuickReplies(false);
                                                            setTimeout(() => {
                                                                if (textareaRef.current) {
                                                                    textareaRef.current.focus();
                                                                    textareaRef.current.style.height = 'auto';
                                                                    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px';
                                                                }
                                                            }, 10);
                                                        }}
                                                        className="w-full text-left p-2 hover:bg-hover rounded-lg transition-colors flex flex-col gap-0.5"
                                                    >
                                                        <span className="text-xs font-semibold text-accent">{qr.shortcut}</span>
                                                        <span className="text-xs text-muted truncate">{qr.content}</span>
                                                        {qr.media && (
                                                            <span className="text-[10px] text-green-400 flex items-center gap-1 mt-0.5">
                                                                <Paperclip size={9} /> {qr.media.name.length > 22 ? qr.media.name.slice(0,22)+'…' : qr.media.name}
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Media Attachment */}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={attachUploading}
                                    title="Attach file"
                                    className="w-10 h-10 rounded-xl bg-elevated border border-theme hover:bg-hover flex items-center justify-center transition-colors text-muted hover:text-accent shrink-0 disabled:opacity-40"
                                >
                                    {attachUploading
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <Paperclip size={16} />}
                                </button>

                                <textarea
                                    value={replyText}
                                    ref={textareaRef}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setReplyText(val);
                                        // Auto-open quick replies dropdown when user types '/'
                                        if (val === '/' || (val.endsWith(' /') && !showQuickReplies)) {
                                            setShowQuickReplies(true);
                                        }
                                        if (textareaRef.current) {
                                            textareaRef.current.style.height = 'auto';
                                            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px';
                                        }
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Type a message… or '/' for quick replies"
                                    rows={1}
                                    className="flex-1 bg-elevated border border-theme rounded-xl px-4 py-2.5 text-sm text-primary placeholder:text-muted outline-none focus:border-accent/50 resize-none transition-colors min-h-[42px] max-h-32"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!replyText.trim() || sendMsg.isPending}
                                    className="w-10 h-10 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all shrink-0 shadow-sm shadow-accent/30"
                                >
                                    {sendMsg.isPending
                                        ? <Loader2 size={16} className="animate-spin text-white" />
                                        : <Send size={16} className="text-white" />
                                    }
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* Modals outside the chat conditionally rendered */}
                {showTemplatePicker && (
                    <TemplatePickerModal
                        onClose={() => setShowTemplatePicker(false)}
                        onSend={async (templateVersionId, variables) => {
                            await sendTemplate.mutateAsync({ templateVersionId, variables });
                        }}
                    />
                )}
            </div>
        </div >
    );
}
