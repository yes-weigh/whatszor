import { Queue, Worker, Job } from 'bullmq';
import { getRedisClient } from './redis';
import { logger } from './logger';
import { waManager } from '../modules/whatsapp/whatsapp.service';
import { prisma } from '../prisma/client';
import { createOrGetConversation } from '../modules/messaging/conversation.service';
import { SystemEventSchema } from '@whatszor/shared';
import { GoogleGenAI } from '@google/genai';
import { env } from '../env';
import { logEvent } from './event-logger';
import { randomUUID } from 'crypto';
import { emit as realtimeEmit } from './realtime';
import { downloadMediaMessage } from '@itsukichan/baileys';
import { saveMedia } from './media-storage';
import { getQueue, QueueName } from '../queues';

// Simple variable parser e.g. {{contact.firstName}}
function parseVariables(text: string, context: Record<string, any>): string {
    if (!text) return text;
    return text.replace(/{{([^}]+)}}/g, (match, path) => {
        const keys = path.trim().split('.');
        let val = context;
        for (const k of keys) {
            val = val?.[k];
            if (val === undefined) break;
        }
        return val !== undefined ? String(val) : match;
    });
}

// Condition evaluator supporting AND / OR logic and extended operators
function evaluateConditions(conditions: any[], context: Record<string, any>, logic: 'AND' | 'OR' = 'AND'): boolean {
    if (!conditions || conditions.length === 0) return true;

    const results = conditions.map(cond => {
        if (cond.type !== 'expression') return true;

        const keys = (cond.field || '').split('.');
        let val: any = context;
        for (const k of keys) {
            val = val?.[k];
            if (val === undefined) break;
        }
        const contextVal = String(val ?? '');
        const targetVal = String(cond.value ?? '');

        switch (cond.operator) {
            case 'eq': return contextVal === targetVal;
            case 'neq': return contextVal !== targetVal;
            case 'contains': return contextVal.includes(targetVal);
            case 'not_contains': return !contextVal.includes(targetVal);
            case 'starts_with': return contextVal.startsWith(targetVal);
            case 'ends_with': return contextVal.endsWith(targetVal);
            case 'gt': return parseFloat(contextVal) > parseFloat(targetVal);
            case 'lt': return parseFloat(contextVal) < parseFloat(targetVal);
            case 'is_set': return val !== undefined && val !== null && val !== '';
            case 'is_not_set': return val === undefined || val === null || val === '';
            default: return contextVal === targetVal;
        }
    });

    return logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

const log = logger.child({ module: 'bullmq' });
const connection = getRedisClient() as any;

export const inboundMessagesQueue = new Queue('inbound-messages', { connection });
export const outboundMessagesQueue = new Queue('outbound-messages', { connection });
export const automationQueue = new Queue('automation', { connection });
export const aiQueue = new Queue('ai', { connection });
export const systemEventsQueue = new Queue('system-events', { connection });
export const historyQueue = new Queue('history-sync', { connection });
export const contactsQueue = new Queue('contacts-sync', { connection });

export function initializeWorkers() {
    log.info('Initializing BullMQ Workers...');

    // Bridge incoming messages from WhatsApp service directly into our BullMQ queue
    waManager.on('messages', async (data) => {
        try {
            const { workspaceId, sessionId, messages } = data;
            await inboundMessagesQueue.add(`inbound-${workspaceId}-${Date.now()}`, {
                workspaceId,
                sessionId,
                messages
            });
        } catch (error) {
            log.error({ error, data }, 'Failed to enqueue incoming messages to inboundMessagesQueue');
        }
    });

    // Bridge history sync events
    waManager.on('history', async (data) => {
        try {
            await historyQueue.add(`history-${data.workspaceId}-${Date.now()}`, data, {
                removeOnComplete: true,
                removeOnFail: 50,
            });
        } catch (error) {
            log.error({ error }, 'Failed to enqueue history sync');
        }
    });

    // Bridge contacts sync events
    // Add a 90s delay so history-sync workers finish creating conversations first
    // (contacts.upsert fires before messaging-history.set chunks complete)
    waManager.on('contacts', async (data) => {
        try {
            await contactsQueue.add(`contacts-${data.workspaceId}-${Date.now()}`, data, {
                removeOnComplete: true,
                delay: 90_000, // wait 90s for history-sync to finish creating conversations
            });
        } catch (error) {
            log.error({ error }, 'Failed to enqueue contacts sync');
        }
    });

    // Handle outbound message receipts directly (lightweight DB update, no BullMQ queue needed)
    waManager.on('receipt', async ({ workspaceId, updates }) => {
        try {
            for (const update of updates) {
                const { key, receipt } = update;
                if (!key.fromMe) continue; // Only our sent messages get status updates
                if (!key.id) continue;

                const status = receipt.readTimestamp ? 'READ'
                    : receipt.playedTimestamp ? 'PLAYED'
                    : 'DELIVERED';

                // Find the message by remoteId scoped to this workspace
                const msg = await (prisma.message as any).findFirst({
                    where: {
                        remoteId: key.id,
                        conversation: { workspaceId },
                    },
                    select: { id: true, status: true, conversationId: true },
                });

                if (!msg) continue;

                // Only upgrade status (SENT -> DELIVERED -> PLAYED -> READ)
                // PLAYED and READ are treated as equivalent (top priority) since
                // voice notes get PLAYED and text gets READ.
                const rank: Record<string, number> = { SENT: 0, DELIVERED: 1, PLAYED: 2, READ: 3 };
                if ((rank[status] ?? 0) <= (rank[msg.status] ?? 0)) continue;

                await (prisma.message as any).update({
                    where: { id: msg.id },
                    data: { status },
                });

                // Also update CampaignMember to keep campaign stats accurate
                const updatedMembers = await (prisma.campaignMember as any).findMany({
                    where: { messageId: msg.id },
                    select: { id: true, campaignId: true, status: true }
                });

                if (updatedMembers.length > 0) {
                    await (prisma.campaignMember as any).updateMany({
                        where: { messageId: msg.id },
                        data: { status },
                    });

                    // Update aggregate stats on the Campaign
                    for (const member of updatedMembers) {
                        // Only increment if it's advancing to a higher state to prevent double-counting
                        if (member.status === status) continue;
                        
                        const campaign = await prisma.campaign.findUnique({ where: { id: member.campaignId } });
                        if (campaign) {
                            const stats = (campaign.stats as Record<string, number>) || {};
                            
                            // Initialize if empty
                            stats.delivered = stats.delivered || 0;
                            stats.read = stats.read || 0;
                            
                            if (status === 'DELIVERED' && member.status !== 'DELIVERED' && member.status !== 'READ' && member.status !== 'PLAYED') {
                                stats.delivered += 1;
                            } else if ((status === 'READ' || status === 'PLAYED') && member.status !== 'READ' && member.status !== 'PLAYED') {
                                stats.read += 1;
                            }
                            
                            await prisma.campaign.update({
                                where: { id: campaign.id },
                                data: { stats: stats as any }
                            });
                        }
                    }
                }

                // Push real-time update to any open UI tabs for this workspace
                realtimeEmit(workspaceId, 'message.status', {
                    messageId: msg.id,
                    conversationId: msg.conversationId,
                    status,
                });
            }
        } catch (error) {
            log.error({ error }, 'Failed to process message receipts');
        }
    });

    // After history sync settles, pull contacts from the live socket's in-memory store
    // and backfill any conversations that still have no waContactName
    waManager.on('refresh-contacts', async ({ sessionId, workspaceId, sock }: { sessionId: string; workspaceId: string; sock: any }) => {
        try {
            const sockContacts: Record<string, any> = (sock as any).contacts ?? {};

            const emptyConvs = await (prisma.conversation as any).findMany({
                where: { workspaceId, sessionId, waContactName: null, provider: 'WHATSAPP' },
                select: { id: true, providerId: true },
            });

            log.info({ sessionId, count: emptyConvs.length }, 'Backfilling missing contact names from socket store');

            let fixed = 0;
            for (const conv of emptyConvs) {
                const jid: string = conv.providerId;
                if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) continue;
                const contact = sockContacts[jid];
                const name = contact?.notify || contact?.name;
                if (!name) continue;

                await (prisma.conversation as any).update({
                    where: { id: conv.id },
                    data: { waContactName: name },
                });
                fixed++;
            }

            log.info({ sessionId, fixed, total: emptyConvs.length }, 'Contact name backfill complete');
        } catch (err) {
            log.error({ err, sessionId }, 'Failed to refresh contacts from socket');
        }
    });

    // 1. Inbound Worker
    // Processes raw payloads from Baileys 'messages.upsert'
    const inboundWorker = new Worker(
        'inbound-messages',
        async (job: Job) => {
            const { workspaceId, sessionId, messages } = job.data;

            for (const msg of messages) {
                try {
                    // Ignore status broadcasts on WhatsApp
                    if (msg.key.remoteJid === 'status@broadcast') continue;

                    const providerId = msg.key.remoteJid as string;

                    // --- KNOWLEDGE BOT INTERCEPTION ---
                    // If the account receiving this message is designated as the knowledge bot,
                    // we completely bypass the normal inbox routing and push straight to ingestion.
                    if (!msg.key.fromMe) {
                        const account = await prisma.whatsAppAccount.findUnique({
                            where: { sessionId },
                            select: { isKnowledgeBot: true }
                        });

                        if (account?.isKnowledgeBot) {
                            let senderPhone = providerId.split('@')[0];
                            
                            if (providerId.endsWith('@lid')) {
                                // 1. Check if the message contains the underlying actor directly
                                if (msg.key.participant && !msg.key.participant.endsWith('@lid')) {
                                    senderPhone = msg.key.participant.split('@')[0];
                                } else {
                                    // 2. Fallback to reverse-engineering via Live contacts maps natively
                                    const contactsMap = waManager.getContactsStore(sessionId);
                                    const resolved = contactsMap.get(providerId);
                                    if (resolved && resolved.jid && !resolved.jid.endsWith('@lid')) {
                                        senderPhone = resolved.jid.split('@')[0];
                                    }
                                }
                            }

                            // Phase 9: Phone-number Access Control
                            const isAllowed = await prisma.allowedNumber.findFirst({
                                where: {
                                    workspaceId,
                                    phoneNumber: { in: [senderPhone, `+${senderPhone}`] },
                                    isActive: true
                                }
                            });

                            if (!isAllowed) {
                                log.warn({ messageId: msg.key.id, senderPhone }, 'Blocked unauthorized knowledge bot access');
                                
                                let rawText = '';
                                if (msg.message?.conversation) rawText = msg.message.conversation;
                                else if (msg.message?.extendedTextMessage?.text) rawText = msg.message.extendedTextMessage.text;
                                else if (msg.message?.imageMessage?.caption) rawText = msg.message.imageMessage.caption;
                                
                                // Store minimal record for debugging
                                await prisma.productKnowledgeSource.create({
                                    data: {
                                        messageId: msg.key.id,
                                        dataType: 'TEXT',
                                        rawText: rawText || '[Media/Unsupported]',
                                        extractedData: {},
                                        fieldConfidence: {},
                                        globalConfidence: 0,
                                        status: 'BLOCKED',
                                        isTrustedSource: false
                                    }
                                });

                                // Send user-friendly rejection message securely
                                const rejectionMsg = 'This number is not enabled for product updates. Please contact admin.';
                                await waManager.getSafeSocket(sessionId).sendMessage(msg.key.remoteJid as string, { text: rejectionMsg }, { quoted: msg as any });
                                continue;
                            }

                            // If allowed -> route into the explicit queue safely.
                            await getQueue(QueueName.KNOWLEDGE_INGESTION).add(msg.key.id, {
                                workspaceId,
                                sessionId,
                                messageId: msg.key.id,
                                senderPhone,
                                payload: msg
                            }, { jobId: msg.key.id });

                            log.info({ messageId: msg.key.id, providerId, senderPhone }, 'Routed incoming authorized message to Product Knowledge Bot pipeline');
                            continue; // Skip all CRM / Conversational Inbox logic
                        }
                    }
                    // ----------------------------------

                    // Extract WhatsApp contact name from the message's pushName
                    const pushName: string | undefined = (msg as any).pushName;

                    // Fetch or construct Conversation
                    const conversation = await createOrGetConversation(workspaceId, {
                        provider: 'WHATSAPP',
                        providerId,
                    });

                    // ── Contact Auto-Creation (Phase 5) ──────────────────────
                    // Ensure the conversation is linked to a CRM Contact.
                    if (!conversation.contactId && !msg.key.fromMe) {
                        try {
                            const phoneStr = providerId.replace('@s.whatsapp.net', '').replace('@c.us', '');
                            let contact = await prisma.contact.findFirst({
                                where: { workspaceId, phone: phoneStr }
                            });

                            if (!contact) {
                                contact = await prisma.contact.create({
                                    data: {
                                        workspaceId,
                                        firstName: pushName || phoneStr,
                                        phone: phoneStr,
                                    }
                                });
                                log.info({ contactId: contact.id, phone: phoneStr }, 'Auto-created new CRM contact from inbound message');
                            }

                            // Link it
                            await prisma.conversation.update({
                                where: { id: conversation.id },
                                data: { contactId: contact.id }
                            });
                            conversation.contactId = contact.id;
                        } catch (contactErr) {
                            log.warn({ err: contactErr, providerId }, 'Failed to auto-create CRM contact');
                        }
                    }
                    // ─────────────────────────────────────────────────────────

                    // Update sessionId and waContactName if we have new information
                    const updatePayload: Record<string, unknown> = {};
                    const conv = conversation as any;
                    if (sessionId && !conv.sessionId) {
                        updatePayload.sessionId = sessionId;
                    }
                    // Always refresh the WhatsApp display name from the latest pushName
                    if (pushName && !msg.key.fromMe) {
                        updatePayload.waContactName = pushName;
                    }
                    if (Object.keys(updatePayload).length > 0) {
                        await (prisma.conversation.update as any)({
                            where: { id: conversation.id },
                            data: updatePayload,
                        });
                        Object.assign(conversation, updatePayload);
                    }

                    // Determine message type & content — accept ALL message types
                    const content = msg.message?.conversation
                        || msg.message?.extendedTextMessage?.text
                        || msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId
                        || null;

                    const hasImage = !!msg.message?.imageMessage;
                    const hasVideo = !!msg.message?.videoMessage;
                    const hasAudio = !!msg.message?.audioMessage;
                    const hasDoc = !!msg.message?.documentMessage;
                    const hasSticker = !!msg.message?.stickerMessage;
                    const hasReaction = !!msg.message?.reactionMessage;

                    let type = 'TEXT';
                    let finalContent = content;
                    let mediaData: any = null;

                    if (hasImage) { type = 'IMAGE'; mediaData = msg.message; }
                    else if (hasVideo) { type = 'VIDEO'; mediaData = msg.message; }
                    else if (hasAudio) { type = 'AUDIO'; mediaData = msg.message; finalContent = finalContent ?? 'Voice message'; }
                    else if (hasDoc) { type = 'DOCUMENT'; mediaData = msg.message; finalContent = finalContent ?? 'Document'; }
                    else if (hasSticker) { type = 'STICKER'; finalContent = '🎭 Sticker'; mediaData = msg.message?.stickerMessage; }
                    else if (hasReaction) {
                        const emoji = msg.message?.reactionMessage?.text ?? '👍';
                        const reactedTo = (msg.message?.reactionMessage as any)?.quotedMessage?.conversation ?? '';
                        type = 'REACTION';
                        finalContent = reactedTo
                            ? `Reacted ${emoji} to: "${reactedTo.substring(0, 30)}"`
                            : `Reacted ${emoji}`;
                        mediaData = msg.message?.reactionMessage;
                    }

                    if (!finalContent && !mediaData) continue; // Ignore empty/system ACKs

                    // Use UPSERT to handle duplicates gracefully (especially from offline catch-ups)
                    const existingMessage = await prisma.message.findUnique({
                        where: {
                            conversationId_remoteId: {
                                conversationId: conversation.id,
                                remoteId: msg.key.id as string,
                            }
                        }
                    });

                    if (!existingMessage) {
                        const createdMsg = await prisma.message.create({
                            data: {
                                conversationId: conversation.id,
                                remoteId: msg.key.id,
                                direction: msg.key.fromMe ? 'OUTBOUND' : 'INBOUND',
                                type: type as any,
                                content: finalContent,
                                mediaData: mediaData as any,
                                status: msg.key.fromMe ? 'SENT' : 'RECEIVED',
                            }
                        });

                        // ── Media download (non-blocking) ──────────────────
                        // Download and persist inbound media to local disk.
                        // We do this AFTER the message is saved so a download
                        // failure never causes message loss.
                        const mediaSpecific = mediaData?.imageMessage 
                                        || mediaData?.videoMessage 
                                        || mediaData?.audioMessage 
                                        || mediaData?.documentMessage;
                        
                        // Some system messages, like button replies, might contain an outer "imageMessage" type 
                        // without an actual downloadable url/mediaKey. Skip download for those.
                        const hasDownloadableMedia = mediaData 
                            && !msg.key.fromMe 
                            && mediaSpecific 
                            && (mediaSpecific.url && !!mediaSpecific.mediaKey);

                        if (hasDownloadableMedia) {
                            try {
                                const mimeType: string =
                                    mediaData.imageMessage?.mimetype
                                    || mediaData.videoMessage?.mimetype
                                    || mediaData.audioMessage?.mimetype
                                    || mediaData.documentMessage?.mimetype
                                    || 'application/octet-stream';

                                const buffer = await downloadMediaMessage(
                                    msg as any,
                                    'buffer',
                                    {},
                                ) as Buffer;

                                const saved = await saveMedia(buffer, {
                                    workspaceId,
                                    messageId: createdMsg.id,
                                    mimeType,
                                });

                                // Extract filename for documents
                                const fileName = mediaData.documentMessage?.fileName ?? undefined;

                                await prisma.message.update({
                                    where: { id: createdMsg.id },
                                    data: {
                                        mediaData: {
                                            ...mediaData as object,
                                            localPath: saved.localPath,
                                            mimeType: saved.mimeType,
                                            fileSize: saved.fileSize,
                                            ...(fileName ? { fileName } : {}),
                                        } as any,
                                    },
                                });

                                log.info({ messageId: createdMsg.id, localPath: saved.localPath }, 'Inbound media downloaded and saved');
                            } catch (dlErr) {
                                log.warn({ err: dlErr, messageId: createdMsg.id }, 'Failed to download inbound media — message saved without localPath');
                            }
                        }

                        await prisma.conversation.update({
                            where: { id: conversation.id },
                            data: {
                                lastMessageAt: new Date(),
                                lastMessage: finalContent ? finalContent.substring(0, 50) : 'Media attachment',
                                // Increment unread if inbound
                                unreadCount: msg.key.fromMe ? conversation.unreadCount : conversation.unreadCount + 1
                            }
                        });

                        log.info({ messageId: msg.key.id, conversationId: conversation.id }, 'Inbound message processed');

                        // Push real-time SSE events to all connected inbox clients
                        realtimeEmit(workspaceId, 'message.new', {
                            conversationId: conversation.id,
                            direction: msg.key.fromMe ? 'OUTBOUND' : 'INBOUND',
                            type,
                            content: finalContent,
                        });
                        realtimeEmit(workspaceId, 'conversation.updated', {
                            conversationId: conversation.id,
                        });

                        // Queue AI chatbot reply for non-outbound messages
                        if (!msg.key.fromMe && content) {
                            await aiQueue.add(`ai-${msg.key.id}`, {
                                workspaceId,
                                conversationId: conversation.id,
                                text: content
                            });

                            // Emit Event to Event Bus for Graph Automation Engine Rules
                            await systemEventsQueue.add(`event-msg-${msg.key.id}`, {
                                eventId: randomUUID(),
                                eventType: 'message_received',
                                timestamp: new Date().toISOString(),
                                source: 'whatsapp_webhook',
                                workspaceId,
                                payload: {
                                    messageId: msg.key.id,
                                    contactId: conversation.contactId,
                                    conversationId: conversation.id,
                                    content: content,
                                    messageType: type,
                                    sessionId: job.data.sessionId, // Which WA account received it
                                }
                            });

                            // Log the global event
                            await logEvent(workspaceId, 'message_received', 'whatsapp_webhook', {
                                messageId: msg.key.id,
                                contactId: conversation.contactId,
                                messageType: type
                            });
                        }
                    } else {
                        log.debug({ messageId: msg.key.id }, 'Message already exists, skipping duplication');
                    }
                } catch (err) {
                    log.error({ err, messageId: msg?.key?.id }, 'Error processing individual message in inbound batch');
                }
            }
        },
        { connection }
    );

    // 2. History Sync Worker
    // Processes messaging-history.set payloads from Baileys — this is how WhatsApp Web shows old chats.
    // Uses bulk DB operations to handle thousands of chats/messages efficiently.
    void new Worker(
        'history-sync',
        async (job: Job) => {
            const { workspaceId, sessionId, chats, messages, contacts } = job.data;

            log.info({ workspaceId, sessionId, chats: chats.length, messages: messages.length }, 'Processing history sync');

            const isGroup = (jid: string) =>
                jid.endsWith('@g.us') || jid.endsWith('@newsletter') || jid.endsWith('@broadcast') || jid === 'status@broadcast';

            // ── 1. Build contact name lookup ──────────────────────────────
            const contactNameMap: Record<string, string> = {};
            for (const c of (contacts ?? [])) {
                const name = c.notify || c.name;
                if (name) {
                    if (c.id) contactNameMap[c.id] = name;
                    if (c.lid) contactNameMap[c.lid] = name;
                }
            }

            // ── 2. Collect all unique individual JIDs ─────────────────────
            // Gather from chats list + from messages (so even chats with only non-text messages are included)
            const jidSet = new Set<string>();

            for (const chat of (chats ?? [])) {
                if (chat.id && !isGroup(chat.id)) jidSet.add(chat.id);
            }
            for (const msg of (messages ?? [])) {
                const jid = msg.key?.remoteJid;
                if (jid && !isGroup(jid)) jidSet.add(jid);
            }

            const jids = Array.from(jidSet);
            if (jids.length === 0) {
                log.info({ workspaceId, sessionId }, 'History sync complete (no valid JIDs)');
                return;
            }

            // ── 3. Bulk upsert conversations (Chunked) ─────────────────────────
            // createMany + skipDuplicates = single INSERT ... ON CONFLICT DO NOTHING
            const CONV_BATCH_SIZE = 1000;
            for (let i = 0; i < jids.length; i += CONV_BATCH_SIZE) {
                const batch = jids.slice(i, i + CONV_BATCH_SIZE);
                await prisma.conversation.createMany({
                    data: batch.map(jid => ({
                        workspaceId,
                        provider: 'WHATSAPP' as const,
                        providerId: jid,
                        sessionId: sessionId ?? null,
                    })),
                    skipDuplicates: true,
                });
            }

            // Fetch all conversation IDs for our JIDs in one query → in-memory map
            const convRows = await prisma.conversation.findMany({
                where: { workspaceId, provider: 'WHATSAPP', providerId: { in: jids } },
                select: { id: true, providerId: true, sessionId: true, waContactName: true, lastMessageAt: true, lastMessage: true },
            });
            const convMap = new Map<string, { id: string; sessionId: string | null; waContactName: string | null; lastMessageAt: Date | null; lastMessage: string | null }>();
            for (const row of convRows) convMap.set(row.providerId, row);

            // ── 4. Bulk update sessionId + waContactName ───────────────────
            // We do this in batches to avoid massive IN clauses
            const needsSession = convRows.filter(r => !r.sessionId && sessionId).map(r => r.id);
            if (needsSession.length > 0) {
                await (prisma.conversation as any).updateMany({
                    where: { id: { in: needsSession } },
                    data: { sessionId },
                });
            }


            // NOTE: waContactName update is done AFTER the messages loop below,
            // so that pushNames extracted from historical messages are also included.

            // ── 5. Bulk insert messages ────────────────────────────────────
            // Build a flat array of message records, skipping duplicates later via createMany
            type MsgRecord = {
                conversationId: string;
                remoteId: string;
                direction: 'INBOUND' | 'OUTBOUND';
                type: string;
                content: string | null;
                mediaData: any;
                status: string;
                createdAt: Date;
                updatedAt: Date;
            };

            const msgRecords: MsgRecord[] = [];
            // Track the latest message per conversation for lastMessage/lastMessageAt update
            const latestMsgPerConv = new Map<string, { at: Date; content: string | null; type: string }>();

            for (const msg of (messages ?? [])) {
                const jid: string = msg.key?.remoteJid;
                if (!jid || isGroup(jid)) continue;

                // Fallback to extract pushName from historical messages
                const pushName = (msg as any).pushName;
                if (pushName && !contactNameMap[jid]) {
                    contactNameMap[jid] = pushName;
                }

                const conv = convMap.get(jid);
                if (!conv) continue;

                const msgTimestamp = msg.messageTimestamp
                    ? new Date(Number(msg.messageTimestamp) * 1000)
                    : new Date();

                // Determine content and type — accept ALL message types
                const textContent = msg.message?.conversation
                    || msg.message?.extendedTextMessage?.text
                    || msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId
                    || null;

                const hasImage = !!msg.message?.imageMessage;
                const hasVideo = !!msg.message?.videoMessage;
                const hasAudio = !!msg.message?.audioMessage;
                const hasDoc = !!msg.message?.documentMessage;
                const hasSticker = !!msg.message?.stickerMessage;
                const hasReaction = !!msg.message?.reactionMessage;

                let type = 'TEXT';
                let content = textContent;
                let mediaData: any = null;

                if (hasImage) { type = 'IMAGE'; mediaData = msg.message; content = content ?? null; }
                else if (hasVideo) { type = 'VIDEO'; mediaData = msg.message; content = content ?? null; }
                else if (hasAudio) { type = 'AUDIO'; mediaData = msg.message; content = content ?? 'Voice message'; }
                else if (hasDoc) { type = 'DOCUMENT'; mediaData = msg.message; content = content ?? 'Document'; }
                else if (hasSticker) { type = 'STICKER'; content = '🎭 Sticker'; }
                else if (hasReaction) { type = 'TEXT'; content = msg.message?.reactionMessage?.text ?? '👍'; }

                // Skip completely empty messages (no type at all — edge case)
                if (!content && !mediaData) continue;

                msgRecords.push({
                    conversationId: conv.id,
                    remoteId: msg.key.id || '',
                    direction: msg.key.fromMe ? 'OUTBOUND' : 'INBOUND',
                    type,
                    content,
                    mediaData,
                    status: msg.key.fromMe ? 'SENT' : 'RECEIVED',
                    createdAt: msgTimestamp,
                    updatedAt: msgTimestamp,
                });

                // Track latest msg per conv for lastMessage update
                // If lastMessage is null, this is a newly created conversation defaulting to now(), so we MUST accept the history timestamp
                if (conv.lastMessage === null || !conv.lastMessageAt || msgTimestamp > conv.lastMessageAt) {
                    const prev = latestMsgPerConv.get(conv.id);
                    if (!prev || msgTimestamp > prev.at) {
                        latestMsgPerConv.set(conv.id, { at: msgTimestamp, content, type });
                    }
                }
            }

            // ── 5b. Apply contact names (after messages loop so pushNames are included) ───
            // We now have the fully-populated contactNameMap (contacts array + pushName from messages)
            // Apply to any conversation currently missing a name.
            for (const [jid, name] of Object.entries(contactNameMap)) {
                const conv = convMap.get(jid);
                if (conv) {
                    // Always update — pushName from a real message is reliable
                    await (prisma.conversation as any).update({
                        where: { id: conv.id },
                        data: { waContactName: name },
                    });
                    conv.waContactName = name; // update in-memory too
                }
            }

            // Bulk insert — skipDuplicates handles re-syncs (remoteId+conversationId are unique)
            if (msgRecords.length > 0) {
                // Chunk the message records to prevent PostgreSQL "too many parameters" error 
                // which triggers above 65,535 parameters on large enterprise history sync payloads.
                const MSG_BATCH_SIZE = 500;
                for (let i = 0; i < msgRecords.length; i += MSG_BATCH_SIZE) {
                    const msgBatch = msgRecords.slice(i, i + MSG_BATCH_SIZE);
                    await prisma.message.createMany({
                        data: msgBatch as any,
                        skipDuplicates: true,
                    });
                }
            }

            // ── 6. Update lastMessage/lastMessageAt per conversation ────────
            // First apply from chat metadata (the `lastMessage` Baileys provides in chat object)
            for (const chat of (chats ?? [])) {
                if (!chat.id || isGroup(chat.id)) continue;
                const conv = convMap.get(chat.id);
                if (!conv) continue;
                if (!chat.conversationTimestamp) continue;

                const chatTs = new Date(Number(chat.conversationTimestamp) * 1000);
                const lm = latestMsgPerConv.get(conv.id);

                // Check against existing in-memory message loop
                if (lm && lm.at >= chatTs) continue;

                // Compare against existing DB row to avoid older history chunks 
                // overwriting a newer lastMessageAt from a previous chunk.
                // If lastMessage is null, it's newly created, so accept the chatTs.
                if (conv.lastMessage !== null && conv.lastMessageAt && conv.lastMessageAt >= chatTs) continue;

                if (!lm) {
                    latestMsgPerConv.set(conv.id, {
                        at: chatTs,
                        content: null, // we don't know the text from metadata alone
                        type: 'TEXT',
                    });
                }
            }

            // Apply all conversation lastMessage updates in parallel batches of 50
            const convUpdates = Array.from(latestMsgPerConv.entries());
            const BATCH = 50;
            for (let i = 0; i < convUpdates.length; i += BATCH) {
                const slice = convUpdates.slice(i, i + BATCH);
                await Promise.all(slice.map(([convId, { at, content, type }]) =>
                    (prisma.conversation as any).update({
                        where: { id: convId },
                        data: {
                            lastMessageAt: at,
                            lastMessage: content
                                ? content.substring(0, 50)
                                : (type === 'IMAGE' ? '📷 Image' : type === 'VIDEO' ? '🎥 Video' : type === 'AUDIO' ? '🎤 Voice' : type === 'DOCUMENT' ? '📎 Document' : type === 'STICKER' ? '🎭 Sticker' : null),
                        },
                    })
                ));
            }

            log.info({ workspaceId, sessionId, convs: jids.length, msgs: msgRecords.length }, 'History sync complete');
        },
        { connection, concurrency: 1 }
    );

    // 3. Contacts Sync Worker
    // Backfills waContactName from the device address book (contacts.upsert event).
    // Also migrates LID-based conversations to use the real phone JID so the actual
    // phone number is shown instead of the WhatsApp Business internal LID.
    void new Worker(
        'contacts-sync',
        async (job: Job) => {
            const { workspaceId, contacts } = job.data;
            for (const contact of (contacts ?? [])) {
                const jid: string = contact.id;           // e.g. "918590344506@s.whatsapp.net"
                const lid: string | undefined = contact.lid; // e.g. "85152726274166@lid"
                const name: string = contact.notify || contact.name;
                if (!jid || !name) continue;
                if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) continue;

                // Update waContactName for conversations matched by real JID or LID
                const jidsToUpdate = [jid, lid].filter(Boolean) as string[];
                await (prisma.conversation as any).updateMany({
                    where: { workspaceId, providerId: { in: jidsToUpdate } },
                    data: { waContactName: name },
                });

                // ── LID Migration ─────────────────────────────────────────
                // If this contact has a LID, find any conversation stored under that LID
                // and migrate it to use the real phone JID. This lets us show the real
                // phone number (+91 85903 44506) instead of the internal LID.
                if (lid) {
                    const lidConv = await (prisma.conversation as any).findFirst({
                        where: { workspaceId, providerId: lid },
                        select: { id: true },
                    });

                    if (lidConv) {
                        // Check if a conversation already exists under the real JID
                        const realConv = await (prisma.conversation as any).findFirst({
                            where: { workspaceId, providerId: jid },
                            select: { id: true, lastMessageAt: true },
                        });

                        if (!realConv) {
                            // Safe to migrate: just update the providerId to the real JID
                            await (prisma.conversation as any).update({
                                where: { id: lidConv.id },
                                data: { providerId: jid, waContactName: name },
                            });
                            log.warn({ workspaceId, lid, jid, name }, 'Migrated LID conversation to real phone JID');
                        } else {
                            // Both exist — just ensure the name is set on both and leave them
                            // (merging conversations risks data loss; user can deduplicate manually)
                            log.warn({ workspaceId, lid, jid }, 'LID and real-JID conversations both exist — skipping merge');
                        }
                    }
                }
            }
        },
        { connection, concurrency: 2 }
    );


    // 4. Outbound Worker
    // Processes jobs enqueued by our REST API POST /messages
    const outboundWorker = new Worker(
        'outbound-messages',
        async (job: Job) => {
            const { workspaceId, messageId, toJid, type, content, mediaData, sessionId } = job.data;

            log.info({ messageId, toJid, sessionId }, 'Processing outbound message');

            let activeSessionId = sessionId;

            if (!activeSessionId) {
                const defaultAccount = await prisma.whatsAppAccount.findFirst({
                    where: { workspaceId, status: 'CONNECTED' }
                });
                if (defaultAccount) activeSessionId = defaultAccount.sessionId;
            }

            const socket = activeSessionId ? waManager.getSafeSocket(activeSessionId) : undefined;
            if (!socket) {
                // If the socket isn't connected, we can't send.
                // Re-queue or fail the job
                throw new Error(`Baileys socket not connected for workspace ${workspaceId}`);
            }

            try {
                const resolveUrl = (url?: string) => {
                    if (!url) return undefined;
                    // Provide an absolute filesystem path that Baileys can use with native fs streams
                    if (url.startsWith('/local-media-placeholder/')) {
                        const { env } = require('../env');
                        return require('path').resolve(process.cwd(), env.MEDIA_DIR || 'uploads/media', url.replace('/local-media-placeholder/', ''));
                    }
                    return url;
                };

                let payload: any;

                if (type === 'TEMPLATE' && mediaData?.templatePayload?.buttons?.length > 0) {
                    const templateData = mediaData.templatePayload;

                    const interactiveButtons = templateData.buttons.map((btn: any, i: number) => {
                        return {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: btn.label,
                                id: btn.payload || `btn_id_${i}`
                            })
                        };
                    });

                    const buttonMessage: any = {
                        footer: templateData.footerText || undefined,
                        interactiveButtons: interactiveButtons,
                    };

                    if (templateData.headerMediaUrl) {
                        const mediaType = templateData.headerMediaType?.toUpperCase();
                        const resolvedUrl = resolveUrl(templateData.headerMediaUrl);
                        if (mediaType === 'IMAGE') {
                            buttonMessage.image = { url: resolvedUrl };
                            buttonMessage.caption = content;
                        } else if (mediaType === 'VIDEO') {
                            buttonMessage.video = { url: resolvedUrl };
                            buttonMessage.caption = content;
                        } else if (mediaType === 'DOCUMENT') {
                            buttonMessage.document = { url: resolvedUrl };
                            buttonMessage.caption = content;
                            buttonMessage.fileName = 'document.pdf';
                        } else {
                            buttonMessage.text = content;
                        }
                    } else {
                        buttonMessage.text = content;
                    }

                    payload = buttonMessage;
                } else if (type === 'TEMPLATE') {
                    // Raw text template with no media and no buttons
                    payload = { text: content };
                } else if (type === 'IMAGE' && mediaData?.url) {
                    payload = { image: { url: resolveUrl(mediaData.url) }, caption: content };
                } else if (type === 'VIDEO' && mediaData?.url) {
                    payload = { video: { url: resolveUrl(mediaData.url) }, caption: content };
                } else if (type === 'DOCUMENT' && mediaData?.url) {
                    payload = { document: { url: resolveUrl(mediaData.url) }, fileName: mediaData.fileName || 'document', caption: content };
                } else {
                    payload = { text: content };
                }

                log.info({ payload }, `Simulating payload structure for ${messageId}`);
                // The original instruction had a malformed snippet here, which seems to be an attempt to insert
                // a replyToMessageId logic block. Assuming the intent was to add debug logging around payload
                // and then the reply logic, but the reply logic is not present in the original file.
                // I will only add the debug log as explicitly requested and correct the malformed line.

                // If part of a campaign, double-check that it wasn't cancelled while in queue
                if (job.data.campaignId) {
                    const campaign = await prisma.campaign.findUnique({
                        where: { id: job.data.campaignId },
                        select: { status: true }
                    });
                    if (campaign?.status === 'CANCELLED') {
                        log.info({ messageId, campaignId: job.data.campaignId }, 'Skipping message - campaign was cancelled');
                        await prisma.message.update({
                            where: { id: messageId },
                            data: { status: 'FAILED' }
                        });
                        return; // Abort sending
                    }
                }

                // Ensure JID is formatted correctly for Baileys
                const formattedJid = toJid.includes('@') ? toJid : `${toJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                
                const result = await socket.sendMessage(formattedJid, payload);

                // Update database
                await prisma.message.update({
                    where: { id: messageId },
                    data: {
                        remoteId: result?.key.id,
                        status: 'SENT'
                    }
                });

                // Sync status to CampaignMember if applicable
                if (job.data.campaignId) {
                    await (prisma.campaignMember as any).updateMany({
                        where: { messageId },
                        data: { status: 'SENT' }
                    });
                    const campaign = await prisma.campaign.findUnique({ where: { id: job.data.campaignId } });
                    if (campaign) {
                        const stats = (campaign.stats as Record<string, number>) || {};
                        stats.sent = (stats.sent || 0) + 1;
                        await prisma.campaign.update({
                            where: { id: campaign.id },
                            data: { stats: stats as any }
                        });
                    }
                }

                // Log global event
                await logEvent(workspaceId, 'message_sent', 'automation_engine', {
                    messageId,
                    toJid,
                    type,
                    campaignId: job.data.campaignId
                });

                log.info({ messageId }, 'Outbound message sent to Baileys');

                // Push real-time SSE status update
                const convRecord = await prisma.message.findUnique({
                    where: { id: messageId },
                    select: { conversationId: true },
                });
                if (convRecord) {
                    realtimeEmit(workspaceId, 'message.status', {
                        messageId,
                        conversationId: convRecord.conversationId,
                        status: 'SENT',
                    });
                    realtimeEmit(workspaceId, 'conversation.updated', {
                        conversationId: convRecord.conversationId,
                    });
                }

            } catch (err: any) {
                log.error({ err, messageId }, 'Failed to send outbound message');
                
                require('fs').writeFileSync('D:/whatszor/apps/api/baileys_error.txt', Object.getOwnPropertyNames(err).map(k => `${k}: ${err[k]}`).join('\n') + '\n\n' + err.stack);
                
                await prisma.message.update({
                    where: { id: messageId },
                    data: { status: 'FAILED' }
                });
                
                if (job.data.campaignId) {
                    await (prisma.campaignMember as any).updateMany({
                        where: { messageId },
                        data: { status: 'FAILED', errorReason: err.message || 'Send failed' }
                    });
                    const campaign = await prisma.campaign.findUnique({ where: { id: job.data.campaignId } });
                    if (campaign) {
                        const stats = (campaign.stats as Record<string, number>) || {};
                        stats.failed = (stats.failed || 0) + 1;
                        await prisma.campaign.update({
                            where: { id: campaign.id },
                            data: { stats: stats as any }
                        });
                    }
                }
                
                throw err;
            }
        },
        { connection }
    );

    // Handle worker errors
    inboundWorker.on('error', (err) => log.error(err, 'Inbound worker failed'));
    outboundWorker.on('error', (err) => log.error(err, 'Outbound worker failed'));



    // 4. Automation Rule Engine Worker
    // Executes sequence of macro actions
    const automationWorker = new Worker(
        'automation',
        async (job: Job) => {
            const { executionId, ruleId, contactId, stepIndex } = job.data;
            log.info({ executionId, stepIndex }, 'Executing automation step');

            const execution = await prisma.automationExecution.findUnique({
                where: { id: executionId },
                include: { rule: true }
            });

            if (!execution || execution.status !== 'RUNNING') return; // Cancelled or Already finished

            const contact = contactId
                ? await prisma.contact.findUnique({ where: { id: contactId } })
                : null;
            // Note: contact may be null for anonymous (unlinked) senders — execution still proceeds

            // Prepare context for variable parsing and conditions
            // event.content and event.sessionId are available for condition checks
            const triggerPayload = (execution.triggerEvent as any)?.payload || {};
            const context = {
                contact: contact,
                rule: execution.rule,
                event: {
                    ...(execution.triggerEvent as any || {}),
                    content: triggerPayload.content || '',
                    sessionId: triggerPayload.sessionId || '',
                }
            };

            const flowDef: any = execution.rule.flowDefinition;
            let currentAction: any;
            let isGraph = false;
            let executedNodeId: string | null = null;
            let nextNodeId: string | null = null;

            if (flowDef && flowDef.nodes && flowDef.nodes.length > 0) {
                isGraph = true;
                executedNodeId = job.data.currentNodeId;

                // Identify start node if not provided
                if (!executedNodeId) {
                    const trigger = flowDef.nodes.find((n: any) => n.type === 'trigger');
                    if (!trigger) return;
                    const edge = flowDef.edges.find((e: any) => e.source === trigger.id);
                    if (!edge) {
                        await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'COMPLETED' } });
                        return;
                    }
                    executedNodeId = edge.target;
                }

                const node = flowDef.nodes.find((n: any) => n.id === executedNodeId);
                if (!node) {
                    await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'COMPLETED' } });
                    return;
                }

                // Determine current action type or default to node.type if Action is explicitly a condition or AI node
                const actionType = node.data?.actionType || (node.type === 'condition' ? 'CONDITION' : null);

                currentAction = {
                    type: actionType,
                    minutes: parseInt(node.data?.delayMinutes || '1', 10),
                    tagValue: node.data?.tagValue,
                    webhookUrl: node.data?.webhookUrl,
                    messageContent: node.data?.messageContent,
                    conditions: node.data?.conditions || []
                };

                // Filter outgoing edges from this node
                const outEdges = flowDef.edges.filter((e: any) => e.source === executedNodeId);

                if (currentAction.type === 'CONDITION') {
                    // Evaluate conditions to choose branch (respects AND/OR logic from node data)
                    const condLogic = node.data?.conditionLogic || 'AND';
                    const isTrue = evaluateConditions(currentAction.conditions, context, condLogic);
                    const handle = isTrue ? 'true' : 'false';
                    const branchEdge = outEdges.find((e: any) => e.sourceHandle === handle);
                    if (branchEdge) nextNodeId = branchEdge.target;
                } else {
                    // Default linear progression
                    if (outEdges.length > 0) nextNodeId = outEdges[0].target;
                }
            } else {
                // Fallback to legacy linear execution
                const actions = execution.rule.actions as any[];
                if (stepIndex >= actions.length) {
                    await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'COMPLETED' } });
                    return;
                }
                currentAction = actions[stepIndex];
            }

            const nextJobData: any = { executionId, ruleId, contactId };
            if (isGraph) {
                nextJobData.currentNodeId = nextNodeId;
            } else {
                nextJobData.stepIndex = stepIndex + 1;
            }

            const nodeStartTime = Date.now();

            try {
                // Execute Step
                switch (currentAction.type) {
                    case 'SEND_WHATSAPP': {
                        // Resolve recipient JID: prefer linked contact phone, fall back to inbound conversation JID
                        const contactForMsg = contactId
                            ? await prisma.contact.findUnique({ where: { id: contactId } })
                            : null;
                        const conversationId = triggerPayload?.conversationId;
                        const conversation = conversationId
                            ? await prisma.conversation.findUnique({ where: { id: conversationId } })
                            : null;
                        const recipientJid = contactForMsg?.phone || conversation?.providerId;

                        if (recipientJid) {
                            const targetConversation = await createOrGetConversation(execution.rule.workspaceId, {
                                provider: 'WHATSAPP',
                                providerId: recipientJid,
                            });

                            const msg = await prisma.message.create({
                                data: {
                                    conversationId: targetConversation.id,
                                    direction: 'OUTBOUND',
                                    type: currentAction.templateId ? 'TEMPLATE' : 'TEXT',
                                    content: parseVariables(currentAction.messageContent || execution.rule.name, context),
                                    status: 'QUEUED',
                                    senderUserId: 'AUTOMATION',
                                }
                            });

                            // Use sessionId from node config, or fall back to the session that received the trigger
                            const targetSessionId = currentAction.sessionId || triggerPayload?.sessionId || execution.rule.workspaceId;

                            await outboundMessagesQueue.add(`send-${msg.id}`, {
                                workspaceId: execution.rule.workspaceId,
                                sessionId: targetSessionId,
                                messageId: msg.id,
                                toJid: recipientJid,
                                type: msg.type,
                                content: msg.content,
                                mediaData: { buttons: null }
                            });
                        } else {
                            log.warn({ executionId, contactId, conversationId }, 'SEND_WHATSAPP: no recipient JID found, skipping');
                        }
                        break;
                    }
                    case 'DELAY': {
                        // Delay execution
                        const minutes = currentAction.minutes || 1;
                        await prisma.automationExecution.update({
                            where: { id: executionId },
                            data: {
                                status: 'PAUSED',
                                resumeAt: new Date(Date.now() + minutes * 60000),
                                currentStep: isGraph ? stepIndex : stepIndex + 1
                            }
                        });

                        // Re-queue explicitly with BullMQ delay functionality
                        if (isGraph) {
                            if (nextNodeId) {
                                await automationQueue.add(
                                    `exec-${executionId}-${nextNodeId}`,
                                    nextJobData,
                                    { delay: minutes * 60000 }
                                );
                            } else {
                                await prisma.automationExecution.update({
                                    where: { id: executionId },
                                    data: { status: 'COMPLETED' }
                                });
                            }
                        } else {
                            await automationQueue.add(
                                `exec-${executionId}-${stepIndex + 1}`,
                                nextJobData,
                                { delay: minutes * 60000 }
                            );
                        }

                        // We do not break here normally, but since we delay we pause flow
                        break;
                    }
                    case 'WEBHOOK': {
                        if (currentAction.webhookUrl) {
                            try {
                                await fetch(currentAction.webhookUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ executionId, contactId, ruleId })
                                });
                            } catch (error) {
                                log.error({ error, url: currentAction.webhookUrl }, 'Webhook execution failure in Flow graph');
                            }
                        }
                        break;
                    }
                    case 'ADD_TAG': {
                        // Future implementation
                        break;
                    }
                    case 'AI_REPLY': {
                        const contact = await prisma.contact.findUnique({ where: { id: contactId } });
                        if (contact?.phone) {
                            try {
                                const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
                                const prompt = parseVariables(currentAction.messageContent || 'Hello', context);

                                const response = await ai.models.generateContent({
                                    model: 'gemini-3-flash-preview',
                                    contents: prompt,
                                });

                                const replyText = response.text;

                                if (replyText) {
                                    const conversation = await createOrGetConversation(execution.rule.workspaceId, {
                                        provider: 'WHATSAPP',
                                        providerId: contact.phone,
                                    });

                                    const msg = await prisma.message.create({
                                        data: {
                                            conversationId: conversation.id,
                                            direction: 'OUTBOUND',
                                            type: 'TEXT',
                                            content: replyText,
                                            status: 'QUEUED',
                                            senderUserId: 'AUTOMATION', // System rule bot
                                        }
                                    });

                                    await outboundMessagesQueue.add(`send-${msg.id}`, {
                                        workspaceId: execution.rule.workspaceId,
                                        messageId: msg.id,
                                        toJid: contact.phone,
                                        type: msg.type,
                                        content: msg.content,
                                        mediaData: { buttons: null }
                                    });
                                }
                            } catch (aiError) {
                                log.error({ aiError, contactId }, 'AI generation failed inside Automation Execution');
                                throw aiError; // Escalate to mark step as FAILED
                            }
                        }
                        break;
                    }
                    case 'CONDITION': {
                        // Condition logic is already evaluated to choose the edge path.
                        // We do nothing inside the execution block except log it.
                        break;
                    }
                }

                // Log execution if graph format
                if (isGraph && executedNodeId) {
                    await prisma.nodeExecutionLog.create({
                        data: {
                            executionId,
                            nodeId: executedNodeId,
                            nodeType: currentAction.type,
                            status: currentAction.type === 'DELAY' ? 'PAUSED' : 'COMPLETED',
                            durationMs: Date.now() - nodeStartTime,
                            result: { nextNodeId }
                        }
                    });

                    // Log global event
                    await logEvent(execution.rule.workspaceId, 'node_executed', 'automation_engine', {
                        executionId,
                        ruleId,
                        contactId,
                        nodeId: executedNodeId,
                        nodeType: currentAction.type,
                        status: currentAction.type === 'DELAY' ? 'PAUSED' : 'COMPLETED',
                        durationMs: Date.now() - nodeStartTime
                    });
                }

                if (currentAction.type === 'DELAY') return; // Pause current branch execution thread here

                // If not delayed, queue the next step sequentially
                if (isGraph) {
                    if (nextNodeId) {
                        await automationQueue.add(`exec-${executionId}-${nextNodeId}`, nextJobData);
                    } else {
                        await prisma.automationExecution.update({
                            where: { id: executionId },
                            data: { status: 'COMPLETED' }
                        });
                    }
                } else {
                    await prisma.automationExecution.update({
                        where: { id: executionId },
                        data: { currentStep: stepIndex + 1 }
                    });
                    await automationQueue.add(`exec-${executionId}-${stepIndex + 1}`, nextJobData);
                }

            } catch (err: any) {
                log.error({ err, executionId }, 'Failed to execute automation step');

                if (isGraph && executedNodeId) {
                    await prisma.nodeExecutionLog.create({
                        data: {
                            executionId,
                            nodeId: executedNodeId,
                            nodeType: currentAction.type,
                            status: 'FAILED',
                            error: err.message,
                            durationMs: Date.now() - nodeStartTime
                        }
                    });

                    // Log global event
                    await logEvent(execution.rule.workspaceId, 'node_failed', 'automation_engine', {
                        executionId,
                        ruleId,
                        contactId,
                        nodeId: executedNodeId,
                        nodeType: currentAction.type,
                        error: err.message,
                        durationMs: Date.now() - nodeStartTime
                    });
                }

                await prisma.automationExecution.update({
                    where: { id: executionId },
                    data: { status: 'FAILED', errorReason: err.message }
                });
            }
        },
        { connection }
    );
    automationWorker.on('error', (err) => log.error(err, 'Automation worker failed'));

    // 5. System Events Router Worker
    // Translates external real-world actions into internal Flow Engine executions
    const systemEventsWorker = new Worker(
        'system-events',
        async (job: Job) => {
            const rawJobData = job.data;
            const parsed = SystemEventSchema.safeParse(rawJobData);

            if (!parsed.success) {
                log.error({ errors: parsed.error, payload: rawJobData }, 'Invalid system event payload');
                return;
            }

            const event = parsed.data;
            log.info({ eventType: event.eventType, workspaceId: event.workspaceId }, 'Routing incoming system event');

            // Find Automation Rules triggered by this event in this workspace
            const allMatchingRules = await prisma.automationRule.findMany({
                where: {
                    workspaceId: event.workspaceId,
                    status: 'ACTIVE',
                    OR: [
                        { eventType: event.eventType }, // exact match
                        { eventType: null },             // catch-all rules
                    ],
                }
            });


            const eventPayload = event.payload as any;
            const incomingSessionId: string | undefined = eventPayload?.sessionId;
            const incomingContent: string = (eventPayload?.content || '').toLowerCase();

            // Resolve workspace account IDs (CUIDs stored in rule) → Baileys sessionId UUIDs
            const waAccounts = await prisma.whatsAppAccount.findMany({
                where: { workspaceId: event.workspaceId },
                select: { id: true, sessionId: true }
            });
            const accountIdToSessionId = new Map(waAccounts.map(a => [a.id, a.sessionId]));

            // Filter rules by session filter and keyword filter
            const triggerRules = allMatchingRules.filter(rule => {
                const flowDef = rule.flowDefinition as any;
                const triggerNode = flowDef?.nodes?.find((n: any) => n.type === 'trigger');
                const triggerData = triggerNode?.data || (rule.trigger as any) || {};

                // Session filter — resolve stored account IDs to Baileys sessionId UUIDs then compare
                if (Array.isArray(triggerData.sessionIds) && triggerData.sessionIds.length > 0) {
                    const resolvedSessionIds = triggerData.sessionIds
                        .map((id: string) => accountIdToSessionId.get(id))
                        .filter(Boolean);
                    if (!incomingSessionId || !resolvedSessionIds.includes(incomingSessionId)) {
                        return false;
                    }
                }

                // Keyword filter — if rule specifies keywords, message must contain at least one
                if (triggerData.keywordFilter && typeof triggerData.keywordFilter === 'string') {
                    const keywords = triggerData.keywordFilter.split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
                    if (keywords.length > 0 && !keywords.some((kw: string) => incomingContent.includes(kw))) {
                        return false;
                    }
                }

                return true;
            });


            for (const rule of triggerRules) {
                // Determine contactId if present to lock execution to a CRM member.
                const contactId = eventPayload?.contactId || null;

                if (!contactId) {
                    log.warn({ ruleId: rule.id }, 'Message event has no linked CRM contact — proceeding with anonymous execution');
                }

                log.info({ ruleId: rule.id, contactId }, 'Instantiating new Automation execution pipeline');

                const execution = await prisma.automationExecution.create({
                    data: {
                        ruleId: rule.id,
                        contactId: contactId,
                        workspaceId: event.workspaceId,
                        status: 'RUNNING',
                        triggerEvent: event as any,
                        context: { sourceToken: event.source }
                    }
                });

                await logEvent(event.workspaceId, 'automation_triggered', 'automation_engine', {
                    executionId: execution.id,
                    ruleId: rule.id,
                    contactId,
                    triggerEventType: event.eventType,
                    source: event.source
                });

                await automationQueue.add(`exec-${execution.id}-start`, {
                    executionId: execution.id,
                    ruleId: rule.id,
                    contactId,
                    stepIndex: 0
                });
            }
        },
        { connection }
    );
    systemEventsWorker.on('error', (err) => log.error(err, 'System Events Router worker failed'));
}
