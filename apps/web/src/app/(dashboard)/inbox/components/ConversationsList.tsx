'use client';

import { useState } from 'react';
import { Search, PenSquare, MessageSquare, X, Filter } from 'lucide-react';
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
  const [unreadPriority, setUnreadPriority] = useState(false);

  const filtered = conversations.filter(c => {
      const name = getDisplayName(c).toLowerCase();
      const last = (c.lastMessage ?? '').toLowerCase();
      const s = search.toLowerCase();
      return !s || name.includes(s) || (c.phone ?? '').includes(s) || last.includes(s);
  }).sort((a, b) => {
      if (unreadPriority) {
          if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
          if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
      }
      return 0; // Chronological default relies on original array order
  });

  return (
    <aside className="w-full md:w-[320px] shrink-0 border-r border-theme flex flex-col bg-surface overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-theme sticky top-0 bg-surface z-10">
            <div className="flex items-center justify-between mb-3">
                <h1 className="font-semibold text-[14px] text-primary tracking-tight">
                    {activeSessionId
                        ? accounts.find(a => a.sessionId === activeSessionId)?.name ?? 'Conversations'
                        : 'Inbox'}
                </h1>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setUnreadPriority(!unreadPriority)}
                        title={unreadPriority ? "Chronological Order" : "Unread Priority"}
                        className={`interactive-press flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors ${unreadPriority ? 'text-primary bg-elevated border border-theme' : 'text-muted hover:text-primary hover:bg-hover border border-transparent'}`}
                    >
                        <Filter size={13} />
                    </button>
                    <button
                        title="New Chat"
                        className="interactive-press flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-hover text-muted hover:text-primary transition-colors border border-transparent"
                    >
                        <PenSquare size={14} />
                    </button>
                </div>
            </div>
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-1.5 mt-1 rounded-md bg-elevated border border-transparent focus-within:border-theme transition-colors">
                <Search size={14} className="text-muted shrink-0" />
                <input
                    className="bg-transparent text-[13px] outline-none flex-1 text-primary placeholder:text-muted w-full h-7"
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
                        className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                            activeSessionId === null
                                ? 'bg-elevated border-theme text-primary'
                                : 'bg-transparent border-transparent text-muted hover:bg-hover hover:text-primary'
                        }`}
                    >
                        All
                        <span className="opacity-50">({conversations.length})</span>
                    </button>

                    {/* ── Per-session chips ── */}
                    {connectedAccounts.map((acc, i) => {
                        const dotColors = ['bg-violet-400','bg-emerald-400','bg-blue-400','bg-amber-400','bg-rose-400','bg-cyan-400'];
                        const dot = dotColors[i % dotColors.length];
                        const count = conversations.filter(c => c.sessionId === acc.sessionId).length;
                        const isActive = activeSessionId === acc.sessionId;
                        return (
                            <button
                                key={acc.sessionId}
                                onClick={() => setActiveSessionId(isActive ? null : acc.sessionId)}
                                title={acc.phoneNumber ?? acc.name}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                                    isActive
                                        ? 'bg-elevated border-theme text-primary'
                                        : 'bg-transparent border-transparent text-muted hover:bg-hover hover:text-primary'
                                }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                                <span className="truncate max-w-[80px]">{acc.name}</span>
                                <span className="opacity-50">({count})</span>
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
                        <div key={i} className="flex gap-3 items-center w-full py-2 px-2">
                           <div className="w-11 h-11 rounded-full bg-elevated" />
                           <div className="flex-1 space-y-2.5">
                               <div className="h-3 bg-elevated rounded w-1/2" />
                               <div className="h-2.5 bg-elevated rounded w-3/4" />
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
                
                // Visual Decay: older than 24 hours
                const ageHours = conv.lastMessageAt ? (new Date().getTime() - new Date(conv.lastMessageAt).getTime()) / 3600000 : 0;
                const isDecayed = ageHours > 24 && conv.unreadCount === 0;

                return (
                    <button
                        key={conv.id}
                        onClick={() => onSelect(conv)}
                        className={`interactive-press w-full text-left px-4 py-3 flex gap-3 items-center border-b border-theme relative ${
                          isActive 
                            ? 'bg-elevated shadow-sm z-10' 
                            : 'hover:bg-hover hover:z-10'
                        }`}
                    >
                        {/* Active Selection Indicator */}
                        {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />}

                        <div className="relative shrink-0">
                            <ContactAvatar jid={conv.providerId} name={name} sessionId={conv.sessionId} sizeClass="w-11 h-11 text-base" delay={idx * 300} />
                            
                            {/* Session colour dot — helps distinguish which account this chat belongs to */}
                            {(() => {
                                const dotColors = ['bg-violet-500','bg-emerald-500','bg-blue-500','bg-amber-500','bg-rose-500','bg-cyan-500'];
                                const accIdx = connectedAccounts.findIndex(a => a.sessionId === conv.sessionId);
                                const dot = accIdx >= 0 ? dotColors[accIdx % dotColors.length] : 'bg-emerald-500';
                                return <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${dot} rounded-full border-2 border-surface`} />;
                            })()}
                        </div>

                        <div className={`flex-1 min-w-0 flex flex-col justify-center transition-opacity duration-300 ${isDecayed && !isActive ? 'opacity-60 grayscale-[30%]' : ''}`}>
                            <div className="flex items-baseline justify-between gap-2">
                                <span className={`text-[14px] truncate tracking-tight ${conv.unreadCount > 0 ? 'font-bold text-primary' : 'font-medium text-secondary'}`}>
                                    {name}
                                </span>
                                <span className={`text-[11px] shrink-0 tabular-nums ${conv.unreadCount > 0 ? 'text-accent font-medium' : 'text-muted'}`}>
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

                            <div className="flex items-center justify-between gap-2 mt-0.5 max-w-full">
                                <span className={`text-[13px] truncate flex-1 ${conv.unreadCount > 0 ? 'text-secondary font-medium' : 'text-muted'}`}>
                                    {conv.lastMessage ?? 'No messages yet'}
                                </span>
                                
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {conv.unreadCount > 0 && (
                                      <span className="h-[18px] min-w-[18px] px-1.5 bg-accent rounded-full flex items-center justify-center text-[10px] font-bold text-bg-base">
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
