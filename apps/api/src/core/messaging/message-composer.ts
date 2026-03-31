import { createLogger } from '../logger';
import { prisma } from '../../prisma/client';
import { renderTemplateVersion, RenderContext } from '../../modules/template/template-renderer';
import { randomUUID } from 'crypto';
import { outboundMessagesQueue } from '../queue';

const log = createLogger({ module: 'message-composer' });

export interface ComposeMessageRequest {
    workspaceId: string;
    conversationId: string;
    senderUserId?: string;
    
    // Delivery Details
    provider: string; // "WHATSAPP"
    providerId: string; // Recipient JID (phone number)
    sessionId?: string | null; // WhatsApp session account ID optional
    campaignId?: string | null; // Optional campaign context
    delay?: number; // Delay in milliseconds before sending
    
    // Direct content (mutually exclusive with templateVersionId)
    type?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO' | 'TEMPLATE';
    content?: string;
    mediaId?: string; // Standard direct media reference
    
    // Template content (mutually exclusive with Direct content)
    templateVersionId?: string;
    templateVariables?: RenderContext;
}

/**
 * The single source of truth for constructing outbound messages.
 * No module may send WhatsApp payload structure mapping manually; it must
 * push requests exclusively through this composer.
 */
export async function composeAndQueueMessage(request: ComposeMessageRequest) {
    const { 
        workspaceId, conversationId, senderUserId,
        providerId, sessionId, campaignId, delay,
        type, content, mediaId, 
        templateVersionId, templateVariables 
    } = request;

    log.debug({ conversationId, providerId }, 'Composing message pipeline initiated');

    // 1. Resolve Template (if required)
    let finalType = type || 'TEXT';
    let finalContent = content;
    let finalMediaData: any = null;
    let finalMediaId = mediaId;

    if (templateVersionId) {
        log.debug({ templateVersionId }, 'Resolving template version');
        
        const rendered = await renderTemplateVersion(templateVersionId, templateVariables || {});
        
        finalType = 'TEMPLATE';
        finalContent = rendered.messageText; 
        
        finalMediaId = rendered.headerMediaId || undefined;
        finalMediaData = {
            templatePayload: rendered,
            footerText: rendered.footerText,
            headerMediaId: rendered.headerMediaId,
            headerMediaType: rendered.headerMediaType,
            buttons: rendered.buttons
        };
    }

    // 2. Persist the Domain Message to DB 
    // This allows UI to optimistic-render immediately and workers to track
    const message = await prisma.message.create({
        data: {
            conversationId,
            workspaceId,
            remoteId: `outbound-${randomUUID()}`, // Temporary local ID until ack
            direction: 'OUTBOUND',
            type: finalType as any,
            content: finalContent,
            mediaData: finalMediaData,
            mediaId: finalMediaId || null,
            status: 'QUEUED', // Status transitions PENDING -> QUEUED -> SENT -> DELIVERED
            senderUserId
        }
    });

    log.info({ messageId: message.id }, 'Outbound message enqueued locally');

    // 3. Dispatch to final Message Worker
    await (outboundMessagesQueue as any).add(`send-${message.id}`, {
        workspaceId,
        messageId: message.id,
        toJid: providerId,
        sessionId,
        type: message.type,
        content: message.content,
        mediaData: message.mediaData,
        mediaId: message.mediaId,
        campaignId
    }, { delay: delay || 0 });

    return message;
}
