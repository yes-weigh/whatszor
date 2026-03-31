import { prisma } from '../../prisma/client';
import type { CreateConversationInput, UpdateConversationInput, SendMessageInput } from '@whatszor/shared';
import { ErrorCodes, createError } from '@whatszor/shared';
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
    const sessionId = input.sessionId ?? null;

    // Prisma upsert using the compound unique index:
    //   @@unique([workspaceId, provider, providerId, sessionId])
    // NOTE: PostgreSQL does NOT treat NULL = NULL in unique indexes, so two concurrent
    // inserts with sessionId=null can both pass the WHERE clause. We catch P2002 and
    // fall back to findFirstOrThrow — this is the narrowest correct pattern.
    try {
        return await prisma.conversation.upsert({
            where: {
                workspaceId_provider_providerId_sessionId: {
                    workspaceId,
                    provider: input.provider,
                    providerId,
                    sessionId: sessionId ?? '',
                },
            },
            update: {
                // Back-fill contactId if it becomes known after creation
                ...(input.contactId ? { contactId: input.contactId } : {}),
            },
            create: {
                workspaceId,
                provider: input.provider,
                providerId,
                sessionId,
                contactId: input.contactId ?? null,
            },
        });
    } catch (e: unknown) {
        const prismaErr = e as { code?: string };
        if (prismaErr.code === 'P2002') {
            // Concurrent insert won the race — retrieve the winner's row
            return prisma.conversation.findFirstOrThrow({
                where: { workspaceId, provider: input.provider, providerId, sessionId, deletedAt: null },
            });
        }
        throw e;
    }
}


export async function listConversations(workspaceId: string, sessionId?: string) {
    const where: Record<string, unknown> = { workspaceId, deletedAt: null };
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
    const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, workspaceId, deletedAt: null },
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

const MESSAGES_PAGE_SIZE = 40;

export async function getMessages(
    workspaceId: string,
    conversationId: string,
    cursor?: string  // ID of the oldest visible message — fetch messages older than this
) {
    // Validate conversation belongs to workspace (soft-delete enforced)
    await getConversation(workspaceId, conversationId);

    const take = MESSAGES_PAGE_SIZE + 1; // +1 to detect if there are even older messages
    // Fetch newest messages first (DESC). With a cursor, fetch messages older than it.
    const items = await prisma.message.findMany({
        where: { conversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > MESSAGES_PAGE_SIZE;
    if (hasMore) items.pop(); // remove the sentinel

    // Reverse so the page is in chronological order (oldest at index 0)
    items.reverse();

    return {
        items,
        // Cursor for the next "load older" call = the oldest item's ID (now at index 0)
        nextCursor: hasMore ? items[0]?.id ?? null : null,
    };
}

/**
 * System-level helper: look up the first CONNECTED session for a workspace.
 * Does NOT check userId ownership — safe only in server-side paths that already
 * have the workspaceId validated.
 */
async function resolveDefaultSessionId(workspaceId: string): Promise<string | null> {
    const account = await prisma.whatsAppAccount.findFirst({
        where: { workspaceId, status: 'CONNECTED', deletedAt: null },
        select: { sessionId: true },
    });
    return account?.sessionId ?? null;
}

export async function sendMessage(
    workspaceId: string,
    userId: string,
    userRole: string,      // ← Required for MEMBER session ownership enforcement
    conversationId: string,
    input: SendMessageInput
) {
    const conversation = await getConversation(workspaceId, conversationId);

    // Resolve which WhatsApp session to use.
    // Priority: explicit override from input > conversation's linked session > any CONNECTED workspace session.
    // LEGACY FALLBACK: if none found, sessionId falls back to workspaceId — this will produce a clear
    // error in the worker ("session not found") and should NEVER fire in a properly configured workspace.
    const sessionId = (input.sessionId as string | undefined)
        ?? conversation.sessionId
        ?? await resolveDefaultSessionId(workspaceId)
        ?? workspaceId; // @deprecated fallback — only for backwards compat with pre-session-tracking data

    // ── MEMBER session ownership guard ──────────────────────────────────────────
    // MEMBERs may only send messages through WhatsApp sessions they personally own.
    // OWNER and ADMIN have full workspace-level session access.
    if (userRole === 'MEMBER' && sessionId !== workspaceId) {
        const session = await prisma.whatsAppAccount.findFirst({
            where: { sessionId, workspaceId, deletedAt: null },
            select: { userId: true },
        });
        if (!session) {
            const err = Object.assign(new Error('Session not found'), { code: 'NOT_FOUND', statusCode: 404 });
            throw err;
        }
        if (session.userId !== userId) {
            const err = Object.assign(
                new Error('Access denied: you can only send messages through sessions you own'),
                { code: 'FORBIDDEN', statusCode: 403 },
            );
            throw err;
        }
    }
    // ────────────────────────────────────────────────────────────────────────────

    if (input.type === 'TEMPLATE' && input.templateVersionId) {
        // Compose + enqueue template inside a transaction
        const message = await prisma.$transaction(async () => {
            const msg = await composeAndQueueMessage({
                workspaceId,
                senderUserId: userId,
                conversationId: conversation.id,
                provider: 'WHATSAPP',
                providerId: conversation.providerId,
                sessionId,
                type: 'TEMPLATE',
                templateVersionId: input.templateVersionId,
                templateVariables: input.templateVariables,
            });

            await prisma.conversation.update({
                where: { id: conversationId },
                data: { lastMessageAt: new Date(), lastMessage: 'Template message' },
            });

            return msg;
        });
        return message;
    }

    // Traditional content messages — wrap creation + enqueue atomically
    const mediaData: any = input.mediaData ? { ...(input.mediaData as any) } : {};
    if (input.fileName) mediaData.fileName = input.fileName;
    // CRITICAL: We NO LONGER resolve mediaId to a URL here.
    // The worker resolves it directly via storageKey for security and performance.

    let contentPreview = 'Media message';
    if (input.type === 'TEXT' && input.content) {
        contentPreview = input.content.substring(0, 80);
    }

    const message = await prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
            data: {
                conversationId,
                workspaceId,
                direction: 'OUTBOUND',
                type: input.type,
                content: input.content ?? null,
                mediaData,
                mediaId: input.mediaId || null,
                status: 'QUEUED',
                senderUserId: userId,
            },
        });

        // Update conversation summary atomically with message creation
        await tx.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: new Date(), lastMessage: contentPreview },
        });

        return msg;
    });

    // Enqueue AFTER transaction commits — guarded: if enqueue fails, mark FAILED immediately
    // instead of leaving the message as QUEUED forever (zombie message).
    const jobId = `out|${workspaceId}|${conversationId}|${message.id}`;
    try {
        await getQueue(QueueName.OUTBOUND_MESSAGES).add(jobId, {
            workspaceId,
            sessionId,
            messageId: message.id,
            toJid: conversation.providerId,
            type: message.type,
            content: message.content,
            mediaData: message.mediaData,
            mediaId: message.mediaId,
        }, { jobId });
    } catch (queueErr) {
        // Queue is down — immediately fail the message so UI shows the real state.
        await prisma.message.update({
            where: { id: message.id },
            data: { status: 'FAILED' },
        }).catch(() => {}); // best-effort — DB may also be down
        throw queueErr;
    }

    return message;
}

export async function approveMessage(
    workspaceId: string,
    messageId: string,
    sessionId?: string
) {
    // Fetch and workspace-scope in a single query (no separate findUnique then check)
    const message = await prisma.message.findFirst({
        where: { id: messageId, workspaceId, deletedAt: null },
        include: { conversation: { select: { providerId: true, id: true } } },
    });

    if (!message) {
        throw createError('Message not found', ErrorCodes.NOT_FOUND, 404);
    }

    if ((message.status as any) !== 'SUGGESTED') {
        throw createError('Message is not in suggested state', ErrorCodes.BAD_REQUEST, 400);
    }

    // Resolve session
    const activeSessionId = sessionId ?? await resolveDefaultSessionId(workspaceId) ?? workspaceId;

    // Atomically transition status and prepare for dispatch
    const updated = await prisma.$transaction(async (tx) => {
        return tx.message.update({
            where: { id: messageId },
            data: { status: 'QUEUED' },
        });
    });

    const jobId = `out|${workspaceId}|${message.conversationId}|${message.id}`;
    await getQueue(QueueName.OUTBOUND_MESSAGES).add(jobId, {
        workspaceId,
        sessionId: activeSessionId,
        messageId: message.id,
        toJid: message.conversation.providerId,
        type: message.type,
        content: message.content,
        mediaData: message.mediaData,
    }, { jobId });

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
