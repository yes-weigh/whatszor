/**
 * Outbound Message Worker
 *
 * Sends queued messages via Baileys. Supports TEXT, TEMPLATE (with buttons),
 * IMAGE, VIDEO, DOCUMENT. Handles campaign job tracking and idempotency.
 * Concurrency: 5
 */
import path from 'path';
import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { logger } from '../logger';
import { waManager } from '../../modules/whatsapp/whatsapp.service';
import { logEvent } from '../event-logger';
import { emit as realtimeEmit } from '../realtime';
import { env } from '../../env';

const log = logger.child({ module: 'worker:outbound-messages' });

/** Resolves local-media-placeholder URLs to real filesystem paths for Baileys. */
function resolveUrl(url?: string): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('/local-media-placeholder/')) {
        return path.resolve(process.cwd(), env.MEDIA_DIR || 'uploads/media', url.replace('/local-media-placeholder/', ''));
    }
    return url;
}

export async function processOutboundMessage(job: Job): Promise<void> {
    const { workspaceId, messageId, toJid, type, content, mediaData, sessionId } = job.data;
    log.info({ messageId, toJid, sessionId }, 'Processing outbound message');

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

    } catch (err: any) {
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
