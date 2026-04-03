import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRealtimeEvents } from '@/hooks/use-realtime-events';

// ── Types ────────────────────────────────────────────────────

export interface WaAccount {
    id: string;
    sessionId: string;
    name: string;
    phoneNumber: string | null;
    status: string;
}

export interface Contact {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
}

export interface Conversation {
    id: string;
    providerId: string;
    phone: string | null;        
    contactName: string | null;  
    waContactName: string | null; 
    sessionId: string | null;    
    status: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    unreadCount: number;
    contact: Contact | null;
}

export interface Message {
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

// ── Context / Hook ──────────────────────────────────────────

export function useConversations() {
    const qc = useQueryClient();

    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null); 
    const [replySession, setReplySession] = useState<string | null>(null);

    // Fetch Accounts
    const { data: accounts = [] } = useQuery<WaAccount[]>({
        queryKey: ['wa-accounts'],
        queryFn: () => api.get('/whatsapp/sessions').then(r => r.data ?? []),
        refetchInterval: 10000,
    });
    const connectedAccounts = accounts.filter(a => a.status === 'CONNECTED');

    // Fetch Conversations
    const { data: convsResult, isLoading: convsLoading } = useQuery<{ items: Conversation[] }>({
        queryKey: ['conversations', activeSessionId],
        queryFn: () => {
            const qs = activeSessionId ? `?sessionId=${activeSessionId}` : '';
            return api.get(`/conversations${qs}`).then(r => r.data ?? { items: [] });
        },
        refetchInterval: 60_000,
    });
    const conversations: Conversation[] = convsResult?.items ?? [];

    // Fetch Messages
    const {
        data: msgsData,
        isLoading: msgsLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteQuery<{ items: Message[]; nextCursor: string | null }>({
        queryKey: ['messages', activeConversation?.id],
        queryFn: ({ pageParam }) =>
            activeConversation
                ? api.get(`/conversations/${activeConversation.id}/messages`, {
                      params: pageParam ? { cursor: pageParam as string } : {},
                  }).then(r => r.data ?? { items: [], nextCursor: null })
                : Promise.resolve({ items: [], nextCursor: null }),
        initialPageParam: null as string | null,
        getNextPageParam: (firstPage) => firstPage.nextCursor ?? undefined,
        enabled: !!activeConversation,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchInterval: 4_000,
    });

    const messages: Message[] = msgsData
        ? [...msgsData.pages].reverse().flatMap(p => p.items)
        : [];

    // Mark as Read
    const markRead = useMutation({
        mutationFn: (convId: string) => api.patch(`/conversations/${convId}`, { unreadCount: 0 }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
    });

    // Handle Active Conversation Set
    const handleSetActiveConversation = useCallback((conv: Conversation | null) => {
        setActiveConversation(conv);
        if (conv) {
            if (conv.unreadCount > 0) markRead.mutate(conv.id);
            setReplySession(connectedAccounts[0]?.sessionId ?? null);
        }
    }, [markRead, connectedAccounts]);

    // Send logic
    const sendMessage = useMutation({
        mutationFn: async (payload: { type: string; content?: string; mediaId?: string; fileName?: string }) => {
            if (!activeConversation) throw new Error('No active conversation');
            return api.post(`/conversations/${activeConversation.id}/messages`, {
                ...payload,
                sessionId: replySession,
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['messages', activeConversation?.id] });
            qc.invalidateQueries({ queryKey: ['conversations'] });
        },
    });

    // Realtime Sync
    const selectedConvRef = useRef<Conversation | null>(null);
    selectedConvRef.current = activeConversation;

    useRealtimeEvents({
        onMessageNew: (payload) => {
            if (payload.conversationId && payload.conversationId === selectedConvRef.current?.id) {
                qc.invalidateQueries({ queryKey: ['messages', payload.conversationId] });
            }
            qc.invalidateQueries({ queryKey: ['conversations'] });
        },
        onConversationUpdated: (payload) => {
            qc.invalidateQueries({ queryKey: ['conversations'] });
            if (payload.conversationId && payload.conversationId === selectedConvRef.current?.id) {
                qc.invalidateQueries({ queryKey: ['messages', payload.conversationId] });
            }
        },
        onMessageStatus: (payload) => {
            if (payload.conversationId && payload.conversationId === selectedConvRef.current?.id) {
                qc.invalidateQueries({ queryKey: ['messages', payload.conversationId] });
            }
        },
    });

    // Session status fallback
    useEffect(() => {
        const connectedIds = new Set(accounts.filter(a => a.status === 'CONNECTED' || a.status === 'CONNECTING').map(a => a.sessionId));
        if (activeSessionId && !connectedIds.has(activeSessionId)) {
            setActiveSessionId(null);
        }
        if (activeConversation?.sessionId && !connectedIds.has(activeConversation.sessionId)) {
            setActiveConversation(null);
        }
    }, [accounts, activeSessionId, activeConversation]);

    return {
        // State
        accounts,
        connectedAccounts,
        activeSessionId,
        setActiveSessionId,
        conversations,
        convsLoading,
        activeConversation,
        setActiveConversation: handleSetActiveConversation,
        replySession,
        setReplySession,
        
        // Messages
        messages,
        msgsLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        
        // Mutations
        sendMessage,
    };
}
