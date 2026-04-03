/**
 * keyword-automation.service.ts
 *
 * The Keyword Automation Revenue Engine.
 * Handles CRUD and the matching engine that intercepts inbound messages.
 *
 * Matching rules:
 *  - Normalize: lowercase + trim + remove punctuation (for exact/contains)
 *  - Support MatchTypes: EXACT, CONTAINS, REGEX, AI_INTENT
 *  - Deterministic Resolution: priority DESC, createdAt ASC
 *  - Idempotency: contactId + messageId + automationId
 *  - Strict Payload Exclusivity: templateId vs (replyText + mediaId)
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';

const log = createLogger({ module: 'keyword-automation' });

const cooldownStore = new Map<string, number>();

setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [key, ts] of cooldownStore) {
        if (ts < cutoff) cooldownStore.delete(key);
    }
}, 5 * 60 * 1000);

export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ');
}

export async function findMatchingKeywordAutomation(
    workspaceId: string,
    text: string
): Promise<{
    automation: any;
    matchedKeyword: string;
} | null> {
    const normalized = normalizeText(text);

    // FETCH ALREADY ORDERED BY PRIORITY DESC, CREATED_AT ASC
    const automations = await (prisma as any).keywordAutomation.findMany({
        where: { workspaceId, isActive: true },
        include: {
            media: { select: { id: true, url: true, type: true, name: true, mimeType: true, storageKey: true } },
            template: {
                include: {
                    versions: {
                        orderBy: { version: 'desc' },
                        take: 1,
                        include: { media: true, buttons: true }
                    }
                }
            }
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    if (!automations.length) return null;

    for (const auto of automations) {
        let matches = false;

        switch (auto.matchType) {
            case 'EXACT':
                matches = normalized === normalizeText(auto.keyword);
                break;
            case 'CONTAINS':
                matches = normalized.includes(normalizeText(auto.keyword));
                break;
            case 'REGEX':
                try {
                    // ReDoS protection: Limit evaluation
                    if (text.length > 500) {
                        matches = false;
                        break;
                    }
                    const regex = new RegExp(auto.keyword, 'i');
                    matches = regex.test(text);
                } catch (err) {
                    log.warn({ err, keyword: auto.keyword }, 'Invalid regex pattern in automation');
                }
                break;
            case 'AI_INTENT':
                // AI_INTENT logic is handled externally or requires an LLM call.
                // For safety, fallback to CONTAINS if reaching this synchronous loop.
                matches = normalized.includes(normalizeText(auto.keyword));
                break;
            default:
                // Legacy fallback
                matches = normalized.includes(normalizeText(auto.keyword));
        }

        if (matches) {
            // Because our query already ordered by priority, the first match found is the ultimate winner.
            return { automation: auto, matchedKeyword: auto.keyword };
        }
    }

    return null;
}

export function isOnCooldown(workspaceId: string, contactId: string, keyword: string, cooldownSec: number): boolean {
    const key = `${workspaceId}:${contactId}:${keyword}`;
    const lastTriggered = cooldownStore.get(key);
    if (!lastTriggered) return false;
    return Date.now() - lastTriggered < cooldownSec * 1000;
}

export function setCooldown(workspaceId: string, contactId: string, keyword: string): void {
    const key = `${workspaceId}:${contactId}:${keyword}`;
    cooldownStore.set(key, Date.now());
}

export async function logAutomationTrigger(params: {
    workspaceId: string;
    automationId: string;
    keyword: string;
    matchType: string;
    replyType: string;
    priority: number;
    executionTimeMs?: number;
    contactId?: string | null;
    messageId?: string | null;
}): Promise<void> {
    try {
        await (prisma as any).automationLog.create({
            data: {
                workspaceId: params.workspaceId,
                automationId: params.automationId,
                keyword: params.keyword,
                matchType: params.matchType,
                replyType: params.replyType,
                priority: params.priority,
                executionTimeMs: params.executionTimeMs ?? 0,
                contactId: params.contactId ?? null,
                messageId: params.messageId ?? null,
            },
        });
    } catch (err) {
        log.warn({ err, automationId: params.automationId }, 'Failed to write automation log');
    }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getKeywordAutomations(workspaceId: string) {
    return (prisma as any).keywordAutomation.findMany({
        where: { workspaceId },
        include: { 
            media: { select: { id: true, name: true, url: true, type: true } },
            template: { select: { id: true, name: true } }
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
}

export async function getKeywordAutomationById(workspaceId: string, id: string) {
    const auto = await (prisma as any).keywordAutomation.findFirst({
        where: { id, workspaceId },
        include: { 
            media: { select: { id: true, name: true, url: true, type: true } },
            template: { select: { id: true, name: true } }
        },
    });
    if (!auto) throw new Error('Automation not found');
    return auto;
}

export async function getKeywordAutomationStats(workspaceId: string, id: string) {
    await getKeywordAutomationById(workspaceId, id);

    const [total, lastLog] = await Promise.all([
        (prisma as any).automationLog.count({ where: { automationId: id } }),
        (prisma as any).automationLog.findFirst({
            where: { automationId: id },
            orderBy: { triggeredAt: 'desc' },
            select: { triggeredAt: true, replyType: true, executionTimeMs: true },
        }),
    ]);

    return {
        triggerCount: total,
        lastTriggeredAt: lastLog?.triggeredAt ?? null,
        lastReplyType: lastLog?.replyType ?? null,
        avgExecutionTimeMs: lastLog?.executionTimeMs ?? null,
    };
}


function validateExclusivity(data: any) {
    if (data.templateId) {
        if (data.replyText || data.mediaId) {
            throw new Error('Payload exclusivity violated: Cannot provide both templateId and replyText/mediaId');
        }
    }
}

export async function createKeywordAutomation(workspaceId: string, data: any) {
    validateExclusivity(data);

    return (prisma as any).keywordAutomation.create({
        data: {
            workspaceId,
            keyword: data.matchType === 'REGEX' ? data.keyword : data.keyword.trim().toLowerCase(),
            matchType: data.matchType ?? 'CONTAINS',
            priority: data.priority ?? 0,
            replyText: data.replyText ?? null,
            mediaId: data.mediaId ?? null,
            templateId: data.templateId ?? null,
            intent: data.intent ?? null,
            cooldownSec: data.cooldownSec ?? 30,
            isActive: data.isActive ?? true,
        },
        include: { 
            media: { select: { id: true, name: true, url: true, type: true } },
            template: { select: { id: true, name: true } }
        },
    });
}

export async function updateKeywordAutomation(workspaceId: string, id: string, data: any) {
    validateExclusivity(data);

    const updateData: any = { ...data };
    if (data.keyword !== undefined && data.matchType !== 'REGEX') {
        updateData.keyword = data.keyword.trim().toLowerCase();
    }
    
    // Explicit null assignments if switching modes
    if (data.templateId) {
        updateData.replyText = null;
        updateData.mediaId = null;
    } else if (data.replyText) {
        updateData.templateId = null;
    }

    return (prisma as any).keywordAutomation.update({
        where: { id, workspaceId },
        data: updateData,
        include: { 
            media: { select: { id: true, name: true, url: true, type: true } },
            template: { select: { id: true, name: true } }
        },
    });
}

export async function deleteKeywordAutomation(workspaceId: string, id: string) {
    await (prisma as any).keywordAutomation.delete({ where: { id, workspaceId } });
}
