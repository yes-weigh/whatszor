'use client';

import { useState } from 'react';
import { Search, PenSquare, MessageSquare, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Conversation, WaAccount } from '@/hooks/useConversations';

// We extract the avatar logic here locally to avoid circular deps for now.
// For a production app, this would live in @/components/ui/ContactAvatar
import { useEffect } from 'react';
import api from '@/lib/api';

const profilePicCache = new Map<string, string | null>();

function getInitial(name: string) {
    if (!name) return 'U';
    return name.trim().charAt(0).toUpperCase();
}

const ACCOUNT_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
];

export function getDisplayName(conv: Conversation): string {
    const crmName = conv.contact
        ? [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(' ').trim() || conv.contact.phone
        : null;

    if (crmName) return crmName;

    const providerId = conv.providerId ?? '';
    const phone = conv.phone ?? providerId.replace(/\D/g, '');

    // Ignore generic WhatsApp Business push names because users want to see the actual number
    if (conv.waContactName && conv.waContactName.toLowerCase() !== 'whatsapp business') {
        return conv.waContactName;
    }

    // Fallback for internal identifiers (LIDs)
    if (providerId.endsWith('@lid')) {
        return 'Hidden Number';
    }

    // Default to phone number
    if (phone) return `+${phone}`;

    return 'Unknown';
}

export function ContactAvatar({ jid, name, sessionId, sizeClass = 'w-10 h-10 text-base', delay = 0 }: {
    jid: string; name: string; sessionId?: string | null; sizeClass?: string; delay?: number;
}) {
    const [imgUrl, setImgUrl] = useState<string | null | undefined>(
        profilePicCache.has(jid) ? profilePicCache.get(jid)! : undefined
    );

    useEffect(() => {
        // @lid JIDs are internal WhatsApp device IDs — they never have profile pictures.
        if (jid.endsWith('@lid')) {
            profilePicCache.set(jid, null);
            setImgUrl(null);
            return;
        }

        if (profilePicCache.has(jid)) {
            setImgUrl(profilePicCache.get(jid) ?? null);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled) return;
            try {
                const params: any = { jid };
                if (sessionId) params.sessionId = sessionId;
                const r = await api.get('/conversations/profile-picture', { params });
                const url = r.data ?? null;
                profilePicCache.set(jid, url);
                if (!cancelled) setImgUrl(url);
            } catch {
                profilePicCache.set(jid, null); 
            }
        }, delay);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [jid, delay, sessionId]);

    const initials = getInitial(name);
    const colorIdx = name ? name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) : 0;
    const bg = ACCOUNT_COLORS[colorIdx % ACCOUNT_COLORS.length];

    if (imgUrl) {
        return <img src={imgUrl} alt={name}
            className={`${sizeClass} rounded-full object-cover shrink-0 ring-1 ring-white/10`} />;
    }
    return (
        <div className={`${bg} ${sizeClass} rounded-full shrink-0 flex items-center justify-center text-white font-semibold select-none shadow-inner`}>
            {initials}
        </div>
    );
}

// ── Component ──────────────────────────────────────────

interface ConversationsListProps {
  conversations: Conversation[];
  loading: boolean;
  accounts: WaAccount[];
  connectedAccounts: WaAccount[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  activeConversation: Conversation | null;
  onSelect: (conv: Conversation) => void;
}

export function ConversationsList({
  conversations,
  loading,
  accounts,
  connectedAccounts,
  activeSessionId,
  setActiveSessionId,
  activeConversation,
  onSelect
}: ConversationsListProps) {
  const [search, setSearch] = useState('');

  const filtered = conversations.filter(c => {
      const name = getDisplayName(c).toLowerCase();
      const last = (c.lastMessage ?? '').toLowerCase();
      const s = search.toLowerCase();
      return !s || name.includes(s) || (c.phone ?? '').includes(s) || last.includes(s);
  });

  return (
    <aside className="w-[320px] shrink-0 border-r border-theme flex flex-col bg-secondary overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-theme/50 sticky top-0 bg-secondary/80 backdrop-blur-md z-10">
            <div className="flex items-center justify-between mb-3">
                <h1 className="font-bold text-primary tracking-tight">
                    {activeSessionId
                        ? accounts.find(a => a.sessionId === activeSessionId)?.name ?? 'Conversations'
                        : 'Inbox'}
                </h1>
                <button
                    title="New Chat"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent/10 text-xs text-accent hover:bg-accent/20 transition-colors font-semibold"
                >
                    <PenSquare size={13} />
                </button>
            </div>
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-theme focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/40 shadow-inner transition-all">
                <Search size={14} className="text-muted shrink-0" />
                <input
                    className="bg-transparent text-sm outline-none flex-1 text-primary placeholder:text-muted/70 w-full"
                    placeholder="Search messages…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                {search && (
                    <button title="Clear" onClick={() => setSearch('')}>
                        <X size={13} className="text-muted hover:text-primary" />
                    </button>
                )}
            </div>

            {/* Session Switcher — only shown when >1 connected account */}
            {connectedAccounts.length > 1 && (
                <div className="flex gap-1.5 mt-3 flex-wrap">
                    {/* ── All chip ── */}
                    <button
                        onClick={() => setActiveSessionId(null)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200 border shadow-sm ${
                            activeSessionId === null
                                ? 'bg-accent/20 border-accent/50 text-accent shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                                : 'bg-white/10 border-white/25 text-white/85 hover:bg-white/15 hover:border-white/40 hover:text-white'
                        }`}
                    >
                        All
                        <span className={activeSessionId === null ? 'opacity-70' : 'opacity-55'}>({conversations.length})</span>
                    </button>

                    {/* ── Per-session chips ── */}
                    {connectedAccounts.map((acc, i) => {
                        const dotColors = ['bg-violet-400','bg-emerald-400','bg-blue-400','bg-amber-400','bg-rose-400','bg-cyan-400'];
                        const borderColors = ['border-violet-400/40','border-emerald-400/40','border-blue-400/40','border-amber-400/40','border-rose-400/40','border-cyan-400/40'];
                        const dot = dotColors[i % dotColors.length];
                        const borderAccent = borderColors[i % borderColors.length];
                        const count = conversations.filter(c => c.sessionId === acc.sessionId).length;
                        const isActive = activeSessionId === acc.sessionId;
                        return (
                            <button
                                key={acc.sessionId}
                                onClick={() => setActiveSessionId(isActive ? null : acc.sessionId)}
                                title={acc.phoneNumber ?? acc.name}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200 border shadow-sm ${
                                    isActive
                                        ? `bg-accent/20 ${borderAccent} text-white shadow-[0_0_8px_rgba(16,185,129,0.2)]`
                                        : `bg-white/10 border-white/25 text-white/85 hover:bg-white/15 hover:border-white/40 hover:text-white`
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${dot} ${isActive ? 'shadow-[0_0_5px_currentColor]' : ''}`} />
                                <span className="truncate max-w-[80px]">{acc.name}</span>
                                <span className={isActive ? 'opacity-70' : 'opacity-55'}>({count})</span>
                            </button>
                        );
                    })}

                </div>
            )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
            {loading && (
                <div className="flex flex-col gap-2 p-4 animate-pulse">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex gap-3 items-center w-full py-2">
                           <div className="w-12 h-12 rounded-full bg-white/5" />
                           <div className="flex-1 space-y-2">
                               <div className="h-4 bg-white/5 rounded w-1/2" />
                               <div className="h-3 bg-white/5 rounded w-3/4" />
                           </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 p-8 text-center h-full">
                    <MessageSquare size={36} className="text-muted opacity-20" />
                    <p className="text-sm font-medium text-muted">No chats found</p>
                </div>
            )}

            {!loading && filtered.map((conv, idx) => {
                const name = getDisplayName(conv);
                const isActive = activeConversation?.id === conv.id;
                
                // UX Detail: Determine "Hot Lead" randomly for demo, or based on time realistically
                const isHotLead = conv.lastMessageAt && new Date().getTime() - new Date(conv.lastMessageAt).getTime() < 3600000; // < 1hr

                return (
                    <button
                        key={conv.id}
                        onClick={() => onSelect(conv)}
                        className={`w-full text-left px-5 py-4 border-b border-theme/30 flex gap-3 items-start transition-all duration-200 ${
                          isActive 
                            ? 'bg-accent/5 relative' 
                            : 'hover:bg-white/[0.02]'
                        }`}
                    >
                        {/* Active Selection Indicator */}
                        {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-r-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}

                        <div className="relative shrink-0 mt-0.5">
                            <ContactAvatar jid={conv.providerId} name={name} sessionId={conv.sessionId} sizeClass="w-12 h-12 text-lg" delay={idx * 300} />
                            
                            {/* Session colour dot — helps distinguish which account this chat belongs to */}
                            {(() => {
                                const dotColors = ['bg-violet-400','bg-emerald-400','bg-blue-400','bg-amber-400','bg-rose-400','bg-cyan-400'];
                                const accIdx = connectedAccounts.findIndex(a => a.sessionId === conv.sessionId);
                                const dot = accIdx >= 0 ? dotColors[accIdx % dotColors.length] : 'bg-emerald-500';
                                return <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${dot} rounded-full border-2 border-secondary shadow-sm`} />;
                            })()}
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
                            <div className="flex items-center justify-between gap-2 max-w-full">
                                <span className={`text-[15px] font-semibold truncate ${isActive ? 'text-primary' : 'text-primary/90'}`}>
                                    {name}
                                </span>
                                <span className={`text-[11px] shrink-0 font-medium ${isActive ? 'text-accent' : 'text-muted'}`}>
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

                            {/* ── DEBUG: raw JID badge ─────────────────────── */}
                            <div className="flex items-center gap-1 mt-0.5">
                                <span className={`font-mono text-[10px] truncate max-w-[200px] px-1 rounded ${
                                    conv.providerId?.endsWith('@lid')
                                        ? 'text-orange-400 bg-orange-500/10'
                                        : 'text-cyan-400 bg-cyan-500/10'
                                }`}>
                                    {conv.providerId}
                                </span>
                            </div>
                            {/* ────────────────────────────────────────────── */}

                            <div className="flex items-center justify-between gap-2 mt-1 max-w-full">
                                <span className={`text-[13px] truncate flex-1 ${conv.unreadCount > 0 ? 'text-primary font-medium' : 'text-muted'}`}>
                                    {isActive ? "Typing..." : (conv.lastMessage ?? 'No messages yet')}
                                </span>
                                
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isHotLead && !conv.unreadCount && (
                                    <span className="text-[10px]" title="Hot Lead">🔥</span>
                                  )}
                                  {conv.unreadCount > 0 && (
                                      <span className="min-w-[20px] h-[20px] px-1 bg-accent rounded-full flex items-center justify-center text-[11px] font-bold text-black drop-shadow-[0_0_4px_rgba(16,185,129,0.4)]">
                                          {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                                      </span>
                                  )}
                                </div>
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    </aside>
  );
}
