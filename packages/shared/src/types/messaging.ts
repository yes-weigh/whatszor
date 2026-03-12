/**
 * Messaging & Conversation TypeScript interfaces shared across apps.
 */

export type ConversationStatus = 'ACTIVE' | 'ARCHIVED' | 'BLOCKED';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO' | 'TEMPLATE' | 'SYSTEM';
export type MessageStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED';

export interface Conversation {
    id: string;
    workspaceId: string;
    provider: string;     // E.g., 'WHATSAPP'
    providerId: string;   // E.g., remote phone number JID
    status: ConversationStatus;

    lastMessageAt: Date;
    lastMessage: string | null;
    unreadCount: number;

    contactId: string | null;

    createdAt: Date;
    updatedAt: Date;
}

export interface Message {
    id: string;
    conversationId: string;
    remoteId: string | null;

    direction: MessageDirection;
    type: MessageType;

    content: string | null;
    mediaData: Record<string, unknown> | null;

    status: MessageStatus;

    senderUserId: string | null;

    createdAt: Date;
    updatedAt: Date;
}
