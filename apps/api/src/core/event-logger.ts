import { prisma } from '../prisma/client';
import { createLogger } from './logger';
import { getTraceId } from './context';

const log = createLogger({ module: 'event-logger' });

export type EventType =
    | 'message_received'
    | 'message_sent'
    | 'message_delivered'
    | 'message_read'
    | 'contact_created'
    | 'contact_updated'
    | 'campaign_sent'
    | 'campaign_triggered'
    | 'campaign_replied'
    | 'automation_triggered'
    | 'node_executed'
    | 'node_failed'
    | 'webhook_received'
    | 'contacts_bulk_deleted'
    // ── Knowledge Bot Events ───────────────────────────
    | 'knowledge_question_asked'     // Bot sent a WhatsApp outreach question
    | 'knowledge_response_received'  // Bot received an inbound reply and decoded it
    | 'knowledge_update_applied'     // Auto-merge accepted — product fields updated
    | 'knowledge_response_orphaned'  // Inbound reply had no resolvable product context
    | 'knowledge_update_failed'      // AI extraction or DB merge failed
    // ── Admin & Audit Events ──────────────────────────
    | 'admin_impersonation'          // Super-admin entered a workspace
    | 'workspace_suspended'          // Admin suspended a workspace
    | 'workspace_activated'          // Admin reactivated a workspace
    | 'member_role_changed'          // OWNER changed a member's role
    | 'session_reassigned'           // Session ownership transferred between members
    | 'qr_relay_triggered'           // Admin triggered QR regeneration for a member
    | 'system_error';

/**
 * Write a structured event to the EventLog table.
 *
 * traceId is automatically resolved from the AsyncLocalStorage request context
 * so every event is automatically correlated to the originating request/job.
 * An explicit traceId override may be passed by long-running workers that
 * receive the traceId from the job payload rather than from ALS.
 */
export async function logEvent(
    workspaceId: string,
    eventType: EventType,
    sourceModule: string,
    payloadMetadata: any = {},
    traceId?: string,
) {
    try {
        await prisma.eventLog.create({
            data: {
                workspaceId,
                eventType,
                sourceModule,
                payloadMetadata,
                traceId: traceId ?? getTraceId(),
            }
        });
    } catch (error) {
        log.error({ error, eventType, workspaceId }, 'Failed to log platform event');
    }
}
