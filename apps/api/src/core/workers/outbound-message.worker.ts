/**
 * Outbound Message Worker
 *
 * Sends queued messages via Baileys. Supports TEXT, TEMPLATE (with buttons),
 * IMAGE, VIDEO, DOCUMENT. Handles campaign job tracking and idempotency.
 * Concurrency: 5
 */
import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { createLogger } from '../logger';
import { waManager } from '../../modules/whatsapp/whatsapp.service';
import { logEvent } from '../event-logger';
import { emit as realtimeEmit } from '../realtime';
import { env } from '../../env';
import { resolve } from 'path';
import { acquireIdempotencyLock, completeIdempotency, releaseIdempotencyLock } from '../idempotency';

const log = createLogger({ module: 'worker:outbound-messages' });

/** Resolves mediaId to a local filesystem path if stored on disk. */
async function resolveMediaPath(mediaId: string): Promise<string> {
    const media = await prisma.media.findUnique({
        where: { id: mediaId },
        select: { storageKey: true },
    });

    if (!media) {
        throw new Error(`Media record not found for id: ${mediaId}`);
    }

    // Currently all media is local. In the future, this would use a storage provider.
    return resolve(process.cwd(), env.MEDIA_DIR || 'uploads/media', media.storageKey);
}

export async function processOutboundMessage(job: Job): Promise<void> {
    const { workspaceId, messageId, toJid, type, content, mediaData, sessionId, traceId } = job.data;

    // ── Mandatory Payload Validation ──────────────────────────────────
    if (!workspaceId || !messageId || !toJid || !type) {
        // Poisoned job — discard immediately, no retry
        log.error({ jobId: job.id, traceId }, 'Outbound job missing required fields — discarding');
        throw Object.assign(new Error('Invalid job payload: missing workspaceId/messageId/toJid/type'), {
            discard: true,
        });
    }
    // ──────────────────────────────────────────────────────────────────

    // ── Atomic Idempotency Check ──────────────────────────────────────────
    const idempotencyKey = `wa:out:${workspaceId}:${messageId}`;
    const state = await acquireIdempotencyLock(idempotencyKey);
    if (state === 'COMPLETED') {
        log.info({ messageId, traceId }, 'Outbound message already sent (COMPLETED), skipping');
        return;
    }
    if (state === 'PROCESSING') {
        log.warn({ messageId, traceId }, 'Outbound message currently being sent by another worker, skipping');
        return;
    }
    // ──────────────────────────────────────────────────────────────────

    // ── Workspace Suspension Guard ────────────────────────────────────
    // Jobs queued before a suspension must not send. Delay + retry so
    // they will eventually send when the workspace is reactivated.
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { status: true },
    });
    if (workspace?.status === 'SUSPENDED') {
        await releaseIdempotencyLock(idempotencyKey);
        log.warn({ workspaceId, messageId }, 'Workspace SUSPENDED — releasing lock and skipping send');
        // Do NOT mark message FAILED — it will retry when workspace is reactivated.
        // Returning without throwing keeps the job in BullMQ for delayed retry.
        return;
    }
    // ──────────────────────────────────────────────────────────────────

    log.info({ messageId, toJid, sessionId, traceId }, 'Processing outbound message');

    try {
        // Resolve session — enforce deletedAt: null and CONNECTED status
        let activeSessionId = sessionId as string | undefined;
        if (!activeSessionId) {
            const defaultAccount = await prisma.whatsAppAccount.findFirst({
                where: { workspaceId, status: 'CONNECTED', deletedAt: null },
                select: { sessionId: true },
            });
            if (defaultAccount) activeSessionId = defaultAccount.sessionId;
        }

        // ── Session Pre-Flight: Validate BEFORE touching the wire ─────────
        if (activeSessionId) {
            const accountCheck = await prisma.whatsAppAccount.findFirst({
                where: { sessionId: activeSessionId, workspaceId, deletedAt: null },
                select: { status: true },
            });
            if (!accountCheck || accountCheck.status !== 'CONNECTED') {
                throw new Error(`Session ${activeSessionId} is not CONNECTED — aborting send`);
            }
        }
        // ─────────────────────────────────────────────────────────────────

        const socket = activeSessionId ? waManager.getSafeSocket(activeSessionId) : undefined;
        if (!socket) {
            throw new Error(`Baileys socket not connected for workspace ${workspaceId}`);
        }

    // Build Baileys payload
    let payload: any;

    if (type === 'TEMPLATE' && mediaData?.templatePayload?.buttons?.length > 0) {
        const templateData = mediaData.templatePayload;
        const interactiveButtons = templateData.buttons.map((btn: any, i: number) => {
            const type = btn.type?.toUpperCase();
            if (type === 'CALL') {
                let phone = (btn.payload || '').replace(/\s+/g, '');
                if (phone.startsWith('+91')) {
                    phone = phone.replace('+91', '');
                } else if (phone.startsWith('91') && phone.length === 12) {
                    phone = phone.substring(2);
                }
                phone = phone.replace(/[^0-9]/g, '');

                return {
                    name: 'cta_call',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.label,
                        phone_number: phone
                    })
                };
            } else if (type === 'URL') {
                return {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.label,
                        url: btn.payload || '',
                        merchant_url: btn.payload || ''
                    })
                };
            } else {
                return {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.label,
                        id: btn.payload || `btn_id_${i}`,
                    })
                };
            }
        });

        const buttonMessage: any = {
            footer: templateData.footerText || undefined,
            interactiveButtons,
        };

        if (templateData.headerMediaId) {
            const mediaType = templateData.headerMediaType?.toUpperCase();
            const filePath = await resolveMediaPath(templateData.headerMediaId);
            
            // Critical for interactiveButtons + media in this Baileys fork
            buttonMessage.hasMediaAttachment = true;
            
            if (mediaType === 'IMAGE') {
                buttonMessage.image = { url: filePath };
                buttonMessage.caption = content;
            } else if (mediaType === 'VIDEO') {
                buttonMessage.video = { url: filePath };
                buttonMessage.caption = content;
            } else if (mediaType === 'DOCUMENT') {
                buttonMessage.document = { url: filePath };
                buttonMessage.caption = content;
                buttonMessage.fileName = templateData.headerFileName || 'document.pdf';
            } else {
                buttonMessage.text = content;
            }
        } else {
            buttonMessage.text = content;
        }

        payload = buttonMessage;
    } else if (type === 'TEMPLATE') {
        const templateData = mediaData?.templatePayload;
        if (templateData?.headerMediaId) {
             const mediaType = templateData.headerMediaType?.toUpperCase();
             const filePath = await resolveMediaPath(templateData.headerMediaId);
             
             if (mediaType === 'IMAGE') {
                 payload = { image: { url: filePath }, caption: content };
             } else if (mediaType === 'VIDEO') {
                 payload = { video: { url: filePath }, caption: content };
             } else if (mediaType === 'DOCUMENT') {
                 payload = { document: { url: filePath }, caption: content, fileName: templateData.headerFileName || 'document.pdf' };
             } else {
                 payload = { text: content };
             }
        } else {
             payload = { text: content };
        }
    } else if (type === 'IMAGE' && mediaData?.mediaId) {
        payload = { 
            image: { url: await resolveMediaPath(mediaData.mediaId) }, 
            caption: content 
        };
    } else if (type === 'VIDEO' && mediaData?.mediaId) {
        payload = { 
            video: { url: await resolveMediaPath(mediaData.mediaId) }, 
            caption: content 
        };
    } else if (type === 'DOCUMENT' && mediaData?.mediaId) {
        payload = { 
            document: { url: await resolveMediaPath(mediaData.mediaId) }, 
            fileName: mediaData.fileName || 'document', 
            caption: content 
        };
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(type) && !mediaData?.mediaId) {
        throw new Error(`Media message of type ${type} missing required mediaId`);
    } else {
        payload = { text: content };
    }

    // Check campaign not cancelled before sending
    if (job.data.campaignId) {
        const campaign = await prisma.campaign.findUnique({
            where: { id: job.data.campaignId },
            select: { status: true },
        });
        if (campaign?.status === 'CANCELLED') {
            log.info({ messageId, campaignId: job.data.campaignId }, 'Skipping — campaign cancelled');
            await prisma.message.update({ where: { id: messageId }, data: { status: 'FAILED' } });
            return;
        }
    }

        const formattedJid = toJid.includes('@') ? toJid : `${toJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        const result = await socket.sendMessage(formattedJid, payload);

        await prisma.message.update({
            where: { id: messageId },
            data: { remoteId: result?.key.id, status: 'SENT' },
        });

        if (job.data.campaignId) {
            await prisma.campaignMember.updateMany({
                where: { messageId },
                data: { status: 'SENT' },
            });
        }

        await logEvent(workspaceId, 'message_sent', 'outbound_worker', { messageId, toJid }, traceId);

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
            realtimeEmit(workspaceId, 'conversation.updated', { conversationId: convRecord.conversationId });
        }

        log.info({ messageId }, 'Outbound message sent');

        // ── Mark as COMPLETED in Redis ────────────────────────
        await completeIdempotency(idempotencyKey);

    } catch (err: any) {
        // ── Release Lock on Failure to Allow Retry ─────────────
        const idempotencyKey = `wa:out:${workspaceId}:${messageId}`;
        await releaseIdempotencyLock(idempotencyKey);

        log.error({ err, messageId, toJid }, 'Failed to send outbound message');

        await prisma.message.update({ where: { id: messageId }, data: { status: 'FAILED' } });

        if (job.data.campaignId) {
            await prisma.campaignMember.updateMany({
                where: { messageId },
                data: { status: 'FAILED', errorReason: err.message || 'Send failed' },
            });
        }

        const convRecord = await prisma.message.findUnique({
            where: { id: messageId },
            select: { conversationId: true },
        });
        if (convRecord) {
            realtimeEmit(workspaceId, 'message.status', {
                messageId,
                conversationId: convRecord.conversationId,
                status: 'FAILED',
            });
            realtimeEmit(workspaceId, 'conversation.updated', { conversationId: convRecord.conversationId });
        }

        throw err; // Triggers BullMQ retry
    }
}
