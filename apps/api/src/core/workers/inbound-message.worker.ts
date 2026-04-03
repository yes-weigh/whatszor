/**
 * Inbound Message Worker
 *
 * Processes raw Baileys 'messages.upsert' payloads from the INBOUND_MESSAGES queue.
 * Responsibilities:
 *  - @lid JID resolution (3-step fallback)
 *  - Knowledge bot interception
 *  - Contact auto-creation & healing
 *  - Message persistence
 *  - Inbound media download & save
 *  - Auto-reply keyword matching
 *  - AI suggested reply queuing
 *  - System event emission for automation engine
 *  - Real-time SSE push
 */
import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { Prisma, MessageType } from '@prisma/client';
import { createLogger } from '../logger';
import { waManager } from '../../modules/whatsapp/whatsapp.service';
import { createOrGetConversation } from '../../modules/messaging/conversation.service';
import { downloadMediaMessage } from '@itsukichan/baileys';
import { saveMedia } from '../media-storage';
import { logEvent } from '../event-logger';
import { emit as realtimeEmit } from '../realtime';
import { getQueue, QueueName } from '../../queues';
import { randomUUID } from 'crypto';
import { acquireIdempotencyLock, completeIdempotency, releaseIdempotencyLock } from '../idempotency';
// Top-level import eliminates the require() hack — no circular dep because
// quick-reply.service only imports prisma, it never imports any queue.
import { findMatchingAutoReply } from '../../modules/quick-replies/quick-reply.service';
// Keyword Automation Engine — PRIMARY layer that runs before QuickReply
import {
    findMatchingKeywordAutomation,
    isOnCooldown,
    setCooldown,
    logAutomationTrigger,
} from '../../modules/automation/keyword-automation.service';
import { BatchProcessingError } from '../errors';

const log = createLogger({ module: 'worker:inbound-messages' });

export async function processInboundMessage(job: Job): Promise<void> {
    const { workspaceId, sessionId, messages } = job.data;
    const errors: Error[] = [];

    for (const msg of messages) {
        try {
            if (msg.key.remoteJid === 'status@broadcast') continue;

            const rawJid = msg.key.remoteJid as string;

            // ── @lid JID resolution ────────────────────────────────────────────
            let providerId = rawJid;
            if (rawJid.endsWith('@lid')) {
                let resolvedJid: string | undefined;

                if ((msg.key as any).remoteJidAlt && !(msg.key as any).remoteJidAlt.endsWith('@lid')) {
                    resolvedJid = (msg.key as any).remoteJidAlt;
                } else if (msg.key.participant && !msg.key.participant.endsWith('@lid')) {
                    resolvedJid = msg.key.participant;
                } else {
                    const contactsMap = waManager.getContactsStore(sessionId);
                    const resolved = contactsMap.get(rawJid);
                    if (resolved?.jid && !resolved.jid.endsWith('@lid')) {
                        resolvedJid = resolved.jid;
                    }
                }

                if (resolvedJid) {
                    providerId = resolvedJid;
                    log.debug({ lid: rawJid, resolved: providerId }, 'Resolved @lid JID');
                } else if (job.attemptsMade < 4) {
                    // Defer — contacts.upsert may not have fired yet.
                    // BullMQ exponential backoff will retry automatically.
                    throw new Error(`Unresolved @lid ${rawJid} — deferring (attempt ${job.attemptsMade + 1})`);
                } else {
                    log.warn({ lid: rawJid }, 'Failed to resolve @lid after max attempts, using as-is');
                }
            }
            // ──────────────────────────────────────────────────────────────────

            // ── Knowledge bot interception ─────────────────────────────────────
            let kbHandled = false;
            if (!msg.key.fromMe) {
                const account = await prisma.whatsAppAccount.findUnique({
                    where: { sessionId },
                    select: { botMode: true },
                });

                if (account?.botMode === 'INTERNAL') {
                    let senderPhone = providerId.split('@')[0];
                    if (providerId.endsWith('@lid')) {
                        if (msg.key.participant && !msg.key.participant.endsWith('@lid')) {
                            senderPhone = msg.key.participant.split('@')[0];
                        } else {
                            const contactsMap = waManager.getContactsStore(sessionId);
                            const resolved = contactsMap.get(providerId);
                            if (resolved?.jid && !resolved.jid.endsWith('@lid')) {
                                senderPhone = resolved.jid.split('@')[0];
                            }
                        }
                    }

                    try {
                        const isAllowed = await prisma.allowedNumber.findFirst({
                            where: {
                                workspaceId,
                                phoneNumber: { in: [senderPhone, `+${senderPhone}`] },
                                isActive: true,
                            },
                        });

                        if (!isAllowed) {
                            log.warn({ senderPhone }, 'Blocked unauthorized knowledge bot access');
                            let rawText = msg.message?.conversation
                                || msg.message?.extendedTextMessage?.text
                                || msg.message?.imageMessage?.caption
                                || '';
                            try {
                                await prisma.productKnowledgeSource.create({
                                    data: {
                                        messageId: msg.key.id,
                                        dataType: 'TEXT',
                                        rawText: rawText || '[Media/Unsupported]',
                                        extractedData: {},
                                        fieldConfidence: {},
                                        globalConfidence: 0,
                                        status: 'BLOCKED',
                                        isTrustedSource: false,
                                    },
                                });
                            } catch (dbErr) {
                                log.warn({ dbErr }, 'Could not log blocked KB message');
                            }
                            try {
                                await waManager.getSafeSocket(sessionId).sendMessage(
                                    providerId,
                                    { text: 'This number is not enabled for product updates. Please contact admin.' },
                                    { quoted: msg as any },
                                );
                            } catch (sendErr) {
                                log.warn({ sendErr }, 'Could not send KB rejection message');
                            }
                            kbHandled = true;
                        } else {
                            await getQueue(QueueName.KNOWLEDGE_INGESTION).add(
                                msg.key.id,
                                { workspaceId, sessionId, messageId: msg.key.id, senderPhone, payload: msg },
                                { jobId: msg.key.id },
                            );
                            log.info({ messageId: msg.key.id, senderPhone }, 'Routed to Knowledge Bot pipeline');
                            kbHandled = true;
                        }
                    } catch (kbErr) {
                        log.error({ kbErr }, 'Knowledge bot interceptor error — falling through to normal inbox');
                    }
                }
            }
            // ──────────────────────────────────────────────────────────────────

            const pushName: string | undefined = (msg as any).pushName;

            const conversation = await createOrGetConversation(workspaceId, {
                provider: 'WHATSAPP',
                providerId,
                sessionId,
            });

            // ── Contact auto-creation ──────────────────────────────────────────
            if (!conversation.contactId && !msg.key.fromMe) {
                try {
                    const phoneStr = providerId.replace('@s.whatsapp.net', '').replace('@c.us', '');
                    let contact;
                    try {
                        contact = await prisma.contact.upsert({
                            where: { workspaceId_phone: { workspaceId, phone: phoneStr } },
                            update: {},
                            create: { workspaceId, firstName: pushName || phoneStr, phone: phoneStr },
                        });
                    } catch (upsertErr: unknown) {
                        // Concurrent worker won — retrieve their row
                        const prismaErr = upsertErr as { code?: string };
                        if (prismaErr.code === 'P2002') {
                            contact = await prisma.contact.findFirstOrThrow({
                                where: { workspaceId, phone: phoneStr },
                            });
                        } else {
                            throw upsertErr;
                        }
                    }
                    await prisma.conversation.update({
                        where: { id: conversation.id },
                        data: { contactId: contact.id },
                    });
                    conversation.contactId = contact.id;
                } catch (contactErr) {
                    log.warn({ err: contactErr, providerId }, 'Failed to auto-create CRM contact');
                }
            }

            // ──────────────────────────────────────────────────────────────────

            // ── @lid contact phone healing ─────────────────────────────────────
            if (rawJid !== providerId && rawJid.endsWith('@lid') && !msg.key.fromMe && conversation.contactId) {
                try {
                    const realPhoneStr = providerId.replace('@s.whatsapp.net', '').replace('@c.us', '');
                    const rawLidPhone = rawJid.replace('@lid', '');
                    const stuckContact = await prisma.contact.findFirst({
                        where: { id: conversation.contactId, phone: { in: [rawJid, rawLidPhone] } },
                        select: { id: true },
                    });
                    if (stuckContact) {
                        await prisma.contact.update({
                            where: { id: stuckContact.id },
                            data: { phone: realPhoneStr, firstName: pushName || undefined },
                        });
                        log.warn({ lid: rawJid, phone: realPhoneStr }, 'Healed Contact.phone from @lid');
                    }
                } catch (healErr) {
                    log.warn({ err: healErr }, 'Failed to heal @lid contact phone');
                }
            }
            // ──────────────────────────────────────────────────────────────────

            // Refresh waContactName
            if (pushName && !msg.key.fromMe) {
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { waContactName: pushName },
                });
                Object.assign(conversation, { waContactName: pushName });
            }

            // ── Message type resolution ────────────────────────────────────────
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
                finalContent = reactedTo ? `Reacted ${emoji} to: "${reactedTo.substring(0, 30)}"` : `Reacted ${emoji}`;
                mediaData = msg.message?.reactionMessage;
            }

            if (!finalContent && !mediaData) continue;
            // ──────────────────────────────────────────────────────────────────

            // ── Atomic Idempotency check ──────────────────────────────────────
            const idempotencyKey = `wa:in:${workspaceId}:${msg.key.id}`;
            const existingState = await acquireIdempotencyLock(idempotencyKey);
            
            if (existingState === 'COMPLETED') {
                log.info({ messageId: msg.key.id }, 'Message already processed (COMPLETED), skipping');
                continue;
            }
            if (existingState === 'PROCESSING') {
                log.warn({ messageId: msg.key.id }, 'Message currently being processed by another worker, skipping duplicate');
                continue;
            }
            // ──────────────────────────────────────────────────────────────────

            // ── Persist Message ─────────────────────────────────────────────
                const createdMsg = await prisma.message.create({
                    data: {
                        conversationId: conversation.id,
                        workspaceId,
                        remoteId: msg.key.id,
                        direction: msg.key.fromMe ? 'OUTBOUND' : 'INBOUND',
                        type: type as MessageType,
                        content: finalContent,
                        mediaData: mediaData as Prisma.InputJsonValue,
                        status: msg.key.fromMe ? 'SENT' : 'RECEIVED',
                    },
                });
            // ──────────────────────────────────────────────────────────────────

            // ── Media download (non-blocking) ──────────────────────────────────
            const mediaSpecific = mediaData?.imageMessage
                || mediaData?.videoMessage
                || mediaData?.audioMessage
                || mediaData?.documentMessage;

            const hasDownloadableMedia = mediaData
                && !msg.key.fromMe
                && mediaSpecific
                && mediaSpecific.url
                && !!mediaSpecific.mediaKey;

            if (hasDownloadableMedia) {
                try {
                    const mimeType: string = mediaData.imageMessage?.mimetype
                        || mediaData.videoMessage?.mimetype
                        || mediaData.audioMessage?.mimetype
                        || mediaData.documentMessage?.mimetype
                        || 'application/octet-stream';

                    const buffer = await downloadMediaMessage(msg as any, 'buffer', {}) as Buffer;
                    const saved = await saveMedia(buffer, { workspaceId, messageId: createdMsg.id, mimeType });
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
                            } as Prisma.InputJsonValue,
                        },
                    });
                    log.info({ messageId: createdMsg.id, localPath: saved.localPath }, 'Inbound media saved');
                } catch (dlErr) {
                    log.warn({ err: dlErr, messageId: createdMsg.id }, 'Media download failed — message saved without localPath');
                }
            }
            // ──────────────────────────────────────────────────────────────────

            await prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    lastMessageAt: new Date(),
                    lastMessage: finalContent ? finalContent.substring(0, 50) : 'Media attachment',
                    ...(msg.key.fromMe ? {} : { unreadCount: { increment: 1 } }),
                },
            });

            // Real-time SSE
            realtimeEmit(workspaceId, 'message.new', {
                conversationId: conversation.id,
                direction: msg.key.fromMe ? 'OUTBOUND' : 'INBOUND',
                type,
                content: finalContent,
            });
            realtimeEmit(workspaceId, 'conversation.updated', { conversationId: conversation.id });

            // ── Auto-reply & AI queuing (inbound only, skip KB-handled messages) ─
            if (!msg.key.fromMe && content && !kbHandled) {
                let autoReplied = false;

                // ── LAYER 1: Keyword Automation Engine (Primary Revenue Layer) ──
                try {
                    const kwMatch = await findMatchingKeywordAutomation(workspaceId, content);
                    if (kwMatch) {
                        const { automation, matchedKeyword } = kwMatch;
                        const contactIdentifier = conversation.contactId ?? conversation.providerId;

                        // Idempotency key: ensures same message never triggers same automation twice
                        const autoIdempotencyKey = `kw-auto:${workspaceId}:${msg.key.id}:${automation.id}`;
                        const alreadyHandled = await acquireIdempotencyLock(autoIdempotencyKey);

                        if (alreadyHandled === 'COMPLETED') {
                            log.info({ automationId: automation.id }, 'Keyword automation already handled — skipping');
                            autoReplied = true;
                        } else if (!isOnCooldown(workspaceId, contactIdentifier, matchedKeyword, automation.cooldownSec)) {
                            log.info({ keyword: matchedKeyword, matchType: automation.matchType, conversationId: conversation.id }, 'Keyword automation matched');

                            // Send media first if attached
                            if (automation.media?.id) {
                                const mediaType = automation.media.type === 'image' ? 'IMAGE'
                                    : automation.media.type === 'video' ? 'VIDEO' : 'DOCUMENT';
                                const mediaMsg = await prisma.message.create({
                                    data: {
                                        conversationId: conversation.id,
                                        workspaceId,
                                        direction: 'OUTBOUND',
                                        type: mediaType as any,
                                        content: null,
                                        mediaData: { mediaId: automation.media.id, fileName: automation.media.name } as any,
                                        status: 'QUEUED',
                                    },
                                });
                                await getQueue(QueueName.OUTBOUND_MESSAGES).add(
                                    `kw-media-${mediaMsg.id}`,
                                    { workspaceId, sessionId, messageId: mediaMsg.id, toJid: providerId, type: mediaType, content: null, mediaData: { mediaId: automation.media.id, fileName: automation.media.name } },
                                );
                            }

                            // Send reply text
                            const textMsg = await prisma.message.create({
                                data: {
                                    conversationId: conversation.id,
                                    workspaceId,
                                    direction: 'OUTBOUND',
                                    type: 'TEXT',
                                    content: automation.replyText,
                                    status: 'QUEUED',
                                },
                            });
                            await getQueue(QueueName.OUTBOUND_MESSAGES).add(
                                `kw-text-${textMsg.id}`,
                                { workspaceId, sessionId, messageId: textMsg.id, toJid: providerId, type: 'TEXT', content: automation.replyText, mediaData: null },
                            );

                            // Set cooldown to prevent spam loops
                            setCooldown(workspaceId, contactIdentifier, matchedKeyword);

                            // Log trigger event for analytics
                            await logAutomationTrigger({
                                workspaceId,
                                automationId: automation.id,
                                keyword: matchedKeyword,
                                matchType: automation.matchType,
                                contactId: conversation.contactId ?? null,
                                messageId: msg.key.id,
                            });

                            await completeIdempotency(autoIdempotencyKey);
                            autoReplied = true;
                        } else {
                            log.debug({ keyword: matchedKeyword, contactId: contactIdentifier }, 'Keyword automation suppressed by cooldown');
                            // Release lock so it doesn't stay stuck as PROCESSING
                            await releaseIdempotencyLock(autoIdempotencyKey);
                            // Still mark as handled to skip QuickReply and AI
                            autoReplied = true;
                        }
                    }
                } catch (kwErr) {
                    log.warn({ err: kwErr }, 'Keyword automation engine error — falling through to QuickReply');
                }

                // ── LAYER 2: Legacy QuickReply / Auto-Reply (Secondary Fallback) ──
                if (!autoReplied) {
                try {
                    const autoReply = await findMatchingAutoReply(workspaceId, content);
                    if (autoReply) {
                        log.info({ keyword: autoReply.keyword, conversationId: conversation.id }, 'Auto-reply matched');

                        // ── Template mode ─────────────────────────────────────
                        if (autoReply.template) {
                            const latestVersion = autoReply.template.versions?.[0];
                            if (latestVersion) {
                                const templatePayload = {
                                    messageText: latestVersion.messageText,
                                    footerText: latestVersion.footerText ?? undefined,
                                    buttons: (latestVersion.buttons ?? []).map((b: any) => ({
                                        type: b.type,
                                        label: b.label,
                                        payload: b.payload,
                                    })),
                                    headerMediaId: latestVersion.media?.id ?? undefined,
                                    headerMediaType: latestVersion.media?.type?.toUpperCase() ?? undefined,
                                    headerFileName: latestVersion.media?.name ?? undefined,
                                };

                                const tplMsg = await prisma.message.create({
                                    data: {
                                        conversationId: conversation.id,
                                        workspaceId,
                                        direction: 'OUTBOUND',
                                        type: 'TEMPLATE',
                                        content: latestVersion.messageText,
                                        mediaData: { templatePayload } as any,
                                        status: 'QUEUED',
                                    },
                                });
                                await getQueue(QueueName.OUTBOUND_MESSAGES).add(`auto-tpl-${tplMsg.id}`, {
                                    workspaceId,
                                    sessionId,
                                    messageId: tplMsg.id,
                                    toJid: providerId,
                                    type: 'TEMPLATE',
                                    content: latestVersion.messageText,
                                    mediaData: { templatePayload },
                                });
                                autoReplied = true;
                            } else {
                                log.warn({ templateId: autoReply.templateId }, 'Auto-reply template has no versions — skipping');
                            }
                        } else {
                            // ── Standard mode: media then text ───────────────
                            if (autoReply.media?.id) {
                                const mediaType = autoReply.media.type === 'image' ? 'IMAGE'
                                    : autoReply.media.type === 'video' ? 'VIDEO' : 'DOCUMENT';
                                const mediaMsg = await prisma.message.create({
                                    data: {
                                        conversationId: conversation.id,
                                        workspaceId,
                                        direction: 'OUTBOUND',
                                        type: mediaType as any,
                                        content: null,
                                        mediaData: { mediaId: autoReply.media.id, fileName: autoReply.media.name } as any,
                                        status: 'QUEUED',
                                    },
                                });
                                await getQueue(QueueName.OUTBOUND_MESSAGES).add(`auto-media-${mediaMsg.id}`, {
                                    workspaceId, sessionId, messageId: mediaMsg.id, toJid: providerId,
                                    type: mediaType, content: null,
                                    mediaData: { mediaId: autoReply.media.id, fileName: autoReply.media.name },
                                });
                            }

                            if (autoReply.content) {
                                const textMsg = await prisma.message.create({
                                    data: {
                                        conversationId: conversation.id,
                                        workspaceId,
                                        direction: 'OUTBOUND',
                                        type: 'TEXT',
                                        content: autoReply.content,
                                        status: 'QUEUED',
                                    },
                                });
                                await getQueue(QueueName.OUTBOUND_MESSAGES).add(`auto-text-${textMsg.id}`, {
                                    workspaceId, sessionId, messageId: textMsg.id, toJid: providerId,
                                    type: 'TEXT', content: autoReply.content, mediaData: null,
                                });
                            }
                            autoReplied = true;
                        }
                    }
                } catch (arErr) {
                    log.warn({ err: arErr }, 'Auto-reply matching failed — continuing');
                }
                } // end if (!autoReplied) for QuickReply

                if (!autoReplied) {
                    await getQueue(QueueName.AI).add(`ai-${msg.key.id}`, {
                        workspaceId,
                        conversationId: conversation.id,
                        text: content,
                    });
                }

                // System event → triggers automation rules
                await getQueue(QueueName.SYSTEM_EVENTS).add(`event-msg-${msg.key.id}`, {
                    eventId: randomUUID(),
                    eventType: 'message_received',
                    timestamp: new Date().toISOString(),
                    source: 'whatsapp_webhook',
                    workspaceId,
                    payload: {
                        messageId: msg.key.id,
                        contactId: conversation.contactId,
                        conversationId: conversation.id,
                        content,
                        messageType: type,
                        sessionId,
                    },
                });

                await logEvent(workspaceId, 'message_received', 'whatsapp_webhook', {
                    messageId: msg.key.id,
                    contactId: conversation.contactId,
                    messageType: type,
                });
            }
            // ──────────────────────────────────────────────────────────────────

            log.info({ messageId: msg.key.id, conversationId: conversation.id }, 'Inbound message processed');

            // ── Mark as COMPLETED in Redis ────────────────────────
            await completeIdempotency(idempotencyKey);

        } catch (err: any) {
            // ── Release Lock on Failure to Allow Retry ─────────────
            const idempotencyKey = `wa:in:${workspaceId}:${msg?.key?.id}`;
            await releaseIdempotencyLock(idempotencyKey);

            log.error({ err, messageId: msg?.key?.id }, 'Error processing inbound message');
            errors.push(err);
        }
    }

    if (errors.length > 0) {
        throw new BatchProcessingError('Inbound message sync failed for one or more messages', errors);
    }
}
