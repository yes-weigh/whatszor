/**
 * System Events Worker
 *
 * Translates external real-world events (message_received, etc.) into
 * Automation Rule executions via the AUTOMATION queue.
 * Concurrency: 3
 */
import { Job } from 'bullmq';
import { z } from 'zod';
import { prisma } from '../../prisma/client';
import { createLogger } from '../logger';
import { logEvent } from '../event-logger';
import { getQueue, QueueName } from '../../queues';

const log = createLogger({ module: 'worker:system-events' });

const SystemEventSchema = z.object({
    eventId: z.string(),
    eventType: z.string(),
    timestamp: z.string(),
    source: z.string(),
    workspaceId: z.string(),
    payload: z.record(z.unknown()).optional(),
});

export async function processSystemEvent(job: Job): Promise<void> {
    const rawJobData = job.data;
    const parsed = SystemEventSchema.safeParse(rawJobData);

    if (!parsed.success) {
        log.error({ errors: parsed.error, payload: rawJobData }, 'Invalid system event payload');
        return;
    }

    const event = parsed.data;
    log.info({ eventType: event.eventType, workspaceId: event.workspaceId }, 'Routing incoming system event');

    const allMatchingRules = await prisma.automationRule.findMany({
        where: {
            workspaceId: event.workspaceId,
            status: 'ACTIVE',
            OR: [
                { eventType: event.eventType },
                { eventType: null },
            ],
        },
    });

    const eventPayload = event.payload as any;
    const incomingSessionId: string | undefined = eventPayload?.sessionId;
    const incomingContent: string = (eventPayload?.content || '').toLowerCase();

    const waAccounts = await prisma.whatsAppAccount.findMany({
        where: { workspaceId: event.workspaceId },
        select: { id: true, sessionId: true },
    });
    const accountIdToSessionId = new Map(waAccounts.map(a => [a.id, a.sessionId]));

    const triggerRules = allMatchingRules.filter(rule => {
        const flowDef = rule.flowDefinition as any;
        const triggerNode = flowDef?.nodes?.find((n: any) => n.type === 'trigger');
        const triggerData = triggerNode?.data || (rule.trigger as any) || {};

        if (Array.isArray(triggerData.sessionIds) && triggerData.sessionIds.length > 0) {
            const resolvedSessionIds = triggerData.sessionIds
                .map((id: string) => accountIdToSessionId.get(id))
                .filter(Boolean);
            if (!incomingSessionId || !resolvedSessionIds.includes(incomingSessionId)) return false;
        }

        if (triggerData.keywordFilter && typeof triggerData.keywordFilter === 'string') {
            const keywords = triggerData.keywordFilter
                .split(',')
                .map((k: string) => k.trim().toLowerCase())
                .filter(Boolean);
            if (keywords.length > 0 && !keywords.some((kw: string) => incomingContent.includes(kw))) return false;
        }

        return true;
    });

    for (const rule of triggerRules) {
        const contactId = eventPayload?.contactId || null;

        if (!contactId) {
            log.warn({ ruleId: rule.id }, 'Message event has no linked CRM contact — anonymous execution');
        }

        const execution = await prisma.automationExecution.create({
            data: {
                ruleId: rule.id,
                contactId,
                workspaceId: event.workspaceId,
                status: 'RUNNING',
                triggerEvent: event as any,
                context: { sourceToken: event.source },
            },
        });

        await logEvent(event.workspaceId, 'automation_triggered', 'automation_engine', {
            executionId: execution.id,
            ruleId: rule.id,
            contactId,
            triggerEventType: event.eventType,
            source: event.source,
        });

        await getQueue(QueueName.AUTOMATION).add(`exec-${execution.id}-start`, {
            executionId: execution.id,
            ruleId: rule.id,
            contactId,
            stepIndex: 0,
        });

        log.info({ ruleId: rule.id, executionId: execution.id }, 'Automation execution queued');
    }
}
