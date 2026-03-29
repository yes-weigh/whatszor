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
import { join, resolve } from 'path';
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
    const { workspaceId, messageId, toJid, type, content, mediaData, sessionId } = job.data;
    
    // ── Atomic Idempotency Check ──────────────────────────────────────
    const idempotencyKey = `wa:out:${workspaceId}:${messageId}`;
    const state = await acquireIdempotencyLock(idempotencyKey);
    if (state === 'COMPLETED') {
        log.info({ messageId }, 'Outbound message already sent (COMPLETED), skipping');
        return;
    }
    if (state === 'PROCESSING') {
        log.warn({ messageId }, 'Outbound message currently being sent by another worker, skipping');
        return;
    }
    // ──────────────────────────────────────────────────────────────────

    log.info({ messageId, toJid, sessionId }, 'Processing outbound message');

    try {
        let activeSessionId = sessionId;
        if (!activeSessionId) {
            const defaultAccount = await prisma.whatsAppAccount.findFirst({
                where: { workspaceId, status: 'CONNECTED' },
            });
            if (defaultAccount) activeSessionId = defaultAccount.sessionId;
        }

        const socket = activeSessionId ? waManager.getSafeSocket(activeSessionId) : undefined;
        if (!socket) {
            throw new Error(`Baileys socket not connected for workspace ${workspaceId}`);
        }

    // Build Baileys payload
    let payload: any;

    if (type === 'TEMPLATE' && mediaData?.templatePayload?.buttons?.length > 0) {
        const templateData = mediaData.templatePayload;
        const interactiveButtons = templateData.buttons.map((btn: any, i: number) => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: btn.label,
                id: btn.payload || `btn_id_${i}`,
            }),
        }));

        const buttonMessage: any = {
            footer: templateData.footerText || undefined,
            interactiveButtons,
        };

        if (templateData.headerMediaId) {
            const mediaType = templateData.headerMediaType?.toUpperCase();
            const filePath = await resolveMediaPath(templateData.headerMediaId);
            
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
        payload = { text: content };
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

    try {
        const formattedJid = toJid.includes('@') ? toJid : `${toJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        const result = await socket.sendMessage(formattedJid, payload);

        await prisma.message.update({
            where: { id: messageId },
            data: { remoteId: result?.key.id, status: 'SENT' },
        });

        if (job.data.campaignId) {
            await (prisma.campaignMember as any).updateMany({
                where: { messageId },
                data: { status: 'SENT' },
            });
            const campaign = await prisma.campaign.findUnique({ where: { id: job.data.campaignId } });
            if (campaign) {
                const stats = (campaign.stats as Record<string, number>) || {};
                stats.sent = (stats.sent || 0) + 1;
                await prisma.campaign.update({ where: { id: campaign.id }, data: { stats: stats as any } });
            }
        }

        await logEvent(workspaceId, 'message_sent', 'automation_engine', { messageId, toJid });

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
            await (prisma.campaignMember as any).updateMany({
                where: { messageId },
                data: { status: 'FAILED', errorReason: err.message || 'Send failed' },
            });
            const campaign = await prisma.campaign.findUnique({ where: { id: job.data.campaignId } });
            if (campaign) {
                const stats = (campaign.stats as Record<string, number>) || {};
                stats.failed = (stats.failed || 0) + 1;
                await prisma.campaign.update({ where: { id: campaign.id }, data: { stats: stats as any } });
            }
        }

        throw err; // Triggers BullMQ retry
    }
}
