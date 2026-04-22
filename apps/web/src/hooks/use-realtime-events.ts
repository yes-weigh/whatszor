import { getApiUrl } from "@/lib/api";
'use client';

/**
 * useRealtimeEvents — SSE hook for real-time inbox updates
 *
 * Connects to GET /api/v1/realtime/events via the browser's native EventSource API
 * and routes incoming events to the provided handlers. Reconnects automatically
 * with exponential backoff on disconnect.
 *
 * Usage:
 *   useRealtimeEvents({
 *     onMessageNew: (payload) => { ... },
 *     onConversationUpdated: (payload) => { ... },
 *     onMessageStatus: (payload) => { ... },
 *   });
 */

import { useEffect, useRef } from 'react';

const API_BASE = getApiUrl();
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

export interface RealtimePayload {
    conversationId?: string;
    messageId?: string;
    direction?: 'INBOUND' | 'OUTBOUND';
    type?: string;
    content?: string | null;
    status?: string;
    // Lead Generation specifics
    leadListId?: string;
    totalFound?: number;
    withPhone?: number;
    errorReason?: string;
    name?: string;
    [key: string]: unknown;
}

export interface RealtimeHandlers {
    onMessageNew?: (payload: RealtimePayload) => void;
    onMessageStatus?: (payload: RealtimePayload) => void;
    onConversationUpdated?: (payload: RealtimePayload) => void;
    onLeadListReady?: (payload: RealtimePayload) => void;
    onLeadListFailed?: (payload: RealtimePayload) => void;
}

export function useRealtimeEvents(handlers: RealtimeHandlers) {
    // Keep handlers stable across re-renders without re-creating the EventSource
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    useEffect(() => {
        let es: EventSource | null = null;
        let retryMs = MIN_RETRY_MS;
        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;

        function connect() {
            if (cancelled) return;

            const token = typeof window !== 'undefined'
                ? localStorage.getItem('accessToken')
                : null;

            if (!token) {
                // Not authenticated yet — retry after a short delay
                retryTimeout = setTimeout(connect, 2_000);
                return;
            }

            // EventSource doesn't support custom headers — pass token as query param.
            // The backend verifies this exactly the same way as the Authorization header.
            const url = `${API_BASE}/realtime/events?token=${encodeURIComponent(token)}`;
            es = new EventSource(url);

            es.onopen = () => {
                retryMs = MIN_RETRY_MS; // reset backoff on successful connect
            };

            es.onmessage = (event) => {
                try {
                    const { type, payload } = JSON.parse(event.data) as {
                        type: string;
                        payload: RealtimePayload;
                    };

                    switch (type) {
                        case 'message.new':
                            handlersRef.current.onMessageNew?.(payload);
                            break;
                        case 'message.status':
                            handlersRef.current.onMessageStatus?.(payload);
                            break;
                        case 'conversation.updated':
                            handlersRef.current.onConversationUpdated?.(payload);
                            break;
                        case 'lead_list.ready':
                            handlersRef.current.onLeadListReady?.(payload);
                            break;
                        case 'lead_list.failed':
                            handlersRef.current.onLeadListFailed?.(payload);
                            break;
                        // 'connected' is a no-op — just confirms the stream is live
                    }
                } catch {
                    // Malformed frame — ignore
                }
            };

            es.onerror = () => {
                es?.close();
                es = null;
                if (!cancelled) {
                    // Exponential backoff: 1s → 2s → 4s → … → 30s
                    retryTimeout = setTimeout(() => {
                        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
                        connect();
                    }, retryMs);
                }
            };
        }

        connect();

        return () => {
            cancelled = true;
            if (retryTimeout) clearTimeout(retryTimeout);
            es?.close();
        };
    }, []); // mount once — handlers are accessed via ref
}
