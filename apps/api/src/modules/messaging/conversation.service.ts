import { prisma } from '../../prisma/client';
import type { CreateConversationInput, UpdateConversationInput, SendMessageInput } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';
import { getQueue, QueueName } from '../../queues';
import { composeAndQueueMessage } from '../../core/messaging/message-composer';

// ── JID Utilities ──────────────────────────────────────────

/** Extract phone number from a WhatsApp JID like "919876543210@s.whatsapp.net" → "919876543210"
 *  Returns null for LID JIDs (@lid) since those are internal WA identifiers, not real phone numbers. */
export function jidToPhone(jid: string): string | null {
    if (jid.endsWith('@lid')) return null;  // LID = internal WhatsApp Business ID, not a phone
    return jid.split('@')[0].split(':')[0];
}

/** Returns true for individual chats by excluding known group/channel/broadcast JID patterns */
export function isIndividualJid(jid: string): boolean {
    // Exclude groups, newsletters, status broadcasts
    if (jid.endsWith('@g.us')) return false;
    if (jid.endsWith('@newsletter')) return false;
    if (jid === 'status@broadcast') return false;
    if (jid.endsWith('@broadcast')) return false;
    // Accept everything else: @s.whatsapp.net, @c.us, bare numbers, etc.
    return true;
}

/** Format a raw phone string to a readable number. E.g., "919876543210" → "+91 98765 43210" */
export function formatPhone(phone: string): string {
    // Simple: prefix with +
    return '+' + phone;
}

// ── Conversations ──────────────────────────────────────────

/** Normalize a WhatsApp JID to its canonical form.
 *  - @c.us → @s.whatsapp.net (legacy format)
 *  - strips device suffix: 919876543210:12@s.whatsapp.net → 919876543210@s.whatsapp.net
 *  - groups (@g.us), newsletters (@newsletter), @lid left as-is */
export function normalizeJid(jid: string): string {
    if (!jid) return jid;
    // Strip device suffix (e.g., "9191234:5@s.whatsapp.net" → "9191234@s.whatsapp.net")
    const noDevice = jid.replace(/:(\d+)@/, '@');
    // Normalize @c.us → @s.whatsapp.net
    return noDevice.replace('@c.us', '@s.whatsapp.net');
}

export async function createOrGetConversation(workspaceId: string, input: CreateConversationInput) {
    // Normalize JID to prevent duplicates from @c.us vs @s.whatsapp.net or device suffixes
    const providerId = normalizeJid(input.providerId);
    const sessionId = input.sessionId || null;

    let conversation = await prisma.conversation.findFirst({
        where: {
            workspaceId,
            provider: input.provider,
            providerId,
            sessionId,
        },
    });

    if (!conversation) {
        try {
            conversation = await prisma.conversation.create({
                data: {
                    workspaceId,
                    provider: input.provider,
                    providerId,
                    sessionId,
                    contactId: input.contactId ?? null,
                },
            });
        } catch (e: any) {
            if (e.code === 'P2002') {
                conversation = await prisma.conversation.findFirstOrThrow({
                    where: {
                        workspaceId,
                        provider: input.provider,
                        providerId,
                        sessionId,
                    }
                });
            } else {
                throw e;
            }
        }
    } else if (input.contactId && !conversation.contactId) {
        conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: { contactId: input.contactId },
        });
    }

    return conversation;
}

export async function listConversations(workspaceId: string, sessionId?: string) {
    const where: Record<string, unknown> = { workspaceId };
    if (sessionId) {
        // Show conversations belonging to exactly this session
        where.sessionId = sessionId;
    }

    const conversations = await (prisma.conversation as any).findMany({
        where,
        include: {
            contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { content: true, direction: true, type: true, createdAt: true }
            }
        },
        orderBy: { lastMessageAt: 'desc' },
    });

    // Filter to individual chats only — exclude groups (@g.us) and newsletters (@newsletter)
    const individual = conversations.filter((c: any) => {
        if (!isIndividualJid(c.providerId as string)) return false;

        const hasMessages = c.messages && c.messages.length > 0;

        // Hide ghost conversations that have zero history AND no lastMessage snippet.
        // WhatsApp Web does not show empty chats even if they have a saved contact name.
        if (!hasMessages && !c.lastMessage) {
            return false;
        }

        return true;
    });

    // Attach computed display fields
    const items = individual.map((conv: any) => {
        const phone = jidToPhone(conv.providerId as string);

        // Priority: CRM contact name > WhatsApp contact name (pushName) > phone number
        const crmName = conv.contact
            ? [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(' ').trim() || conv.contact.phone
            : null;
        const contactName = crmName || conv.waContactName || null;

        const lastMsg = conv.messages[0];
        const TYPE_EMOJI: Record<string, string> = {
            IMAGE: '📷 Photo', VIDEO: '🎥 Video', AUDIO: '🎤 Voice', DOCUMENT: '📎 Document',
            STICKER: '🎭 Sticker', TEMPLATE: '📋 Template',
        };
        const lastMessagePreview = lastMsg
            ? (lastMsg.type !== 'TEXT' ? (TYPE_EMOJI[lastMsg.type] ?? '📎 Media') : lastMsg.content ?? '')
            : conv.lastMessage ?? '';


        return {
            id: conv.id,
            providerId: conv.providerId,
            phone,
            contactName,
            waContactName: conv.waContactName ?? null,
            sessionId: conv.sessionId ?? null,
            status: conv.status,
            lastMessage: lastMessagePreview,
            lastMessageAt: conv.lastMessageAt,
            unreadCount: conv.unreadCount,
            contact: conv.contact,
        };
    });

    return { items };
}

export async function getConversation(workspaceId: string, conversationId: string) {
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId, workspaceId },
        include: {
            contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
    });
    if (!conversation) throw createError('Conversation not found', ErrorCodes.NOT_FOUND, 404);
    return conversation;
}

export async function updateConversation(
    workspaceId: string,
    conversationId: string,
    input: UpdateConversationInput
) {
    await getConversation(workspaceId, conversationId);

    return prisma.conversation.update({
        where: { id: conversationId },
        data: {
            ...(input.status && { status: input.status }),
            ...(input.contactId !== undefined && { contactId: input.contactId }),
            ...(input.unreadCount !== undefined && { unreadCount: input.unreadCount }),
        },
    });
}

// ── Messages ───────────────────────────────────────────────

export async function getMessages(workspaceId: string, conversationId: string) {
    await getConversation(workspaceId, conversationId);

    return {
        items: await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        })
    };
}

export async function sendMessage(
    workspaceId: string,
    userId: string,
    conversationId: string,
    input: SendMessageInput
) {
    const conversation = await getConversation(workspaceId, conversationId);

    // Resolve which WhatsApp account to use
    let sessionId = input.sessionId as string | null ?? null;
    if (!sessionId) {
        const fallback = await prisma.whatsAppAccount.findFirst({
            where: { workspaceId, status: 'CONNECTED' },
            select: { sessionId: true }
        });
        sessionId = fallback?.sessionId ?? workspaceId;
    }

    if (input.type === 'TEMPLATE' && input.templateVersionId) {
        // Use the centralized composer that correctly formats Baileys payloads
        const message = await composeAndQueueMessage({
            workspaceId,
            senderUserId: userId,
            conversationId: conversation.id,
            provider: 'WHATSAPP',
            providerId: conversation.providerId,
            sessionId: sessionId,
            type: 'TEMPLATE',
            templateVersionId: input.templateVersionId,
            templateVariables: input.templateVariables,
        });

        await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                lastMessageAt: new Date(),
                lastMessage: 'Template message',
            },
        });

        return message;
    }

    // Traditional content messages
    const mediaData = input.mediaData ? (input.mediaData as any) : undefined;

    // Resolve mediaGalleryId → real file URL (so Baileys can fetch/stream it directly)
    let resolvedMediaData = mediaData;
    const anyInput = input as any;
    if (anyInput.mediaGalleryId) {
        const galleryItem = await prisma.media.findFirst({
            where: { id: anyInput.mediaGalleryId, workspaceId },
            select: { url: true, mimeType: true, name: true },
        });
        if (galleryItem?.url) {
            resolvedMediaData = { url: galleryItem.url, fileName: anyInput.fileName || galleryItem.name };
        }
    }

    const message = await prisma.message.create({
        data: {
            conversationId,
            direction: 'OUTBOUND',
            type: input.type,
            content: input.content ?? null,
            mediaData: resolvedMediaData,
            status: 'QUEUED',
            senderUserId: userId,
        },
    });

    await getQueue(QueueName.OUTBOUND_MESSAGES).add(`send-${message.id}`, {
        workspaceId,
        sessionId,
        messageId: message.id,
        toJid: conversation.providerId,
        type: message.type,
        content: message.content,
        mediaData: message.mediaData
    });

    // Update conversation summary
    let contentPreview = 'Media message';
    if (input.type === 'TEXT' && input.content) {
        contentPreview = input.content.substring(0, 80);
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            lastMessageAt: new Date(),
            lastMessage: contentPreview,
        },
    });

    return message;
}

export async function approveMessage(
    workspaceId: string,
    messageId: string,
    sessionId?: string
) {
    const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: { conversation: true }
    });

    if (!message || message.conversation.workspaceId !== workspaceId) {
        throw createError('Message not found', ErrorCodes.NOT_FOUND, 404);
    }

    if ((message.status as any) !== 'SUGGESTED') {
        throw createError('Message is not in suggested state', ErrorCodes.BAD_REQUEST, 400);
    }

    // Resolve which WhatsApp account to use
    let activeSessionId = sessionId;
    if (!activeSessionId) {
        const fallback = await prisma.whatsAppAccount.findFirst({
            where: { workspaceId, status: 'CONNECTED' },
            select: { sessionId: true }
        });
        activeSessionId = fallback?.sessionId ?? workspaceId;
    }

    // Update status to QUEUED
    const updated = await prisma.message.update({
        where: { id: messageId },
        data: { status: 'QUEUED' }
    });

    // Add to outbound queue
    await getQueue(QueueName.OUTBOUND_MESSAGES).add(`send-approved-${message.id}`, {
        workspaceId,
        sessionId: activeSessionId,
        messageId: message.id,
        toJid: message.conversation.providerId,
        type: message.type,
        content: message.content,
        mediaData: message.mediaData
    });

    return updated;
}

export async function generateSuggestedReply(workspaceId: string, conversationId: string) {
    await getConversation(workspaceId, conversationId);

    // Queue an AI generation job
    const { aiQueue } = await import('../../core/queue');
    await aiQueue.add(`manual-ai-${Date.now()}`, {
        workspaceId,
        conversationId,
    });

    return { success: true, message: 'AI suggestion queued' };
}

function createError(message: string, code: string, statusCode: number) {
    const err = new Error(message) as Error & { code: string; statusCode: number };
    err.code = code;
    err.statusCode = statusCode;
    return err;
}
