/**
 * System Events Worker
 *
 * Translates external real-world events (message_received, etc.) into
 * Automation Rule executions via the AUTOMATION queue.
 *
 * Performance optimizations:
 *  - Caches automationRule.findMany() per (workspaceId) — 30s TTL
 *  - Caches whatsAppAccount.findMany() per (workspaceId) — 60s TTL
 *  - logEvent() is fire-and-forget (batched internally in event-logger)
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

// ── Rule cache ────────────────────────────────────────────────────────────────
// automationRule.findMany() is called for every system event.
// At 100 sessions × 1 msg/s this was 100 DB scans/sec.
// 30s TTL cache reduces it to ~2 DB reads/min per workspace.

const RULE_CACHE_TTL_MS = 30_000;
const ruleCache = new Map<string, { rules: any[]; expiresAt: number }>();

const ACCOUNT_CACHE_TTL_MS = 60_000;
const accountMapCache = new Map<string, { map: Map<string, string>; expiresAt: number }>();

setInterval(() => {
    const now = Date.now();
    for (const [key, val] of ruleCache.entries()) {
        if (val.expiresAt < now) ruleCache.delete(key);
    }
    for (const [key, val] of accountMapCache.entries()) {
        if (val.expiresAt < now) accountMapCache.delete(key);
    }
}, 120_000);

async function getActiveRules(workspaceId: string, eventType: string) {
    const key = `${workspaceId}:${eventType}`;
    const cached = ruleCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.rules;

    const rules = await prisma.automationRule.findMany({
        where: {
            workspaceId,
            status: 'ACTIVE',
            OR: [
                { eventType },
                { eventType: null },
            ],
        },
    });

    ruleCache.set(key, { rules, expiresAt: Date.now() + RULE_CACHE_TTL_MS });
    return rules;
}

async function getAccountIdToSessionId(workspaceId: string): Promise<Map<string, string>> {
    const cached = accountMapCache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) return cached.map;

    const accounts = await prisma.whatsAppAccount.findMany({
        where: { workspaceId },
        select: { id: true, sessionId: true },
    });
    const map = new Map(accounts.map(a => [a.id, a.sessionId]));
    accountMapCache.set(workspaceId, { map, expiresAt: Date.now() + ACCOUNT_CACHE_TTL_MS });
    return map;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function processSystemEvent(job: Job): Promise<void> {
    const rawJobData = job.data;
    const parsed = SystemEventSchema.safeParse(rawJobData);

    if (!parsed.success) {
        log.error({ errors: parsed.error, payload: rawJobData }, 'Invalid system event payload');
        return;
    }

    const event = parsed.data;
    log.info({ eventType: event.eventType, workspaceId: event.workspaceId }, 'Routing incoming system event');

    // Cache-first loads — no DB hit if cache is warm
    const [allMatchingRules, accountIdToSessionId] = await Promise.all([
        getActiveRules(event.workspaceId, event.eventType),
        getAccountIdToSessionId(event.workspaceId),
    ]);

    const eventPayload = event.payload as any;
    const incomingSessionId: string | undefined = eventPayload?.sessionId;
    const incomingContent: string = (eventPayload?.content || '').toLowerCase();

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

        // Fire-and-forget — event-logger uses an internal batch buffer
        logEvent(event.workspaceId, 'automation_triggered', 'automation_engine', {
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
