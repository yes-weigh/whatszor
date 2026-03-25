import { prisma } from '../prisma/client';
import { logger } from './logger';

export type EventType =
    | 'message_received'
    | 'message_sent'
    | 'message_delivered'
    | 'message_read'
    | 'contact_created'
    | 'contact_updated'
    | 'campaign_sent'
    | 'campaign_replied'
    | 'automation_triggered'
    | 'node_executed'
    | 'node_failed'
    | 'webhook_received'
    | 'contacts_bulk_deleted'
    | 'system_error';

export async function logEvent(
    workspaceId: string,
    eventType: EventType,
    sourceModule: string,
    payloadMetadata: any = {}
) {
    try {
        await prisma.eventLog.create({
            data: {
                workspaceId,
                eventType,
                sourceModule,
                payloadMetadata,
            }
        });
    } catch (error) {
        logger.error({ error, eventType, workspaceId }, 'Failed to log platform event');
    }
}
