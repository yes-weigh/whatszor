/**
 * keyword-automation.service.ts
 *
 * The Keyword Automation Revenue Engine.
 * Handles CRUD and the matching engine that intercepts inbound messages.
 *
 * Matching rules (per co-founder constraints):
 *  - Normalize: lowercase + trim + remove punctuation
 *  - Support "contains" and "exact" match types
 *  - If multiple automations match → prefer longest keyword (most specific wins)
 *  - Per-contact cooldown via in-memory Map (30s default)
 *  - Idempotency: contactId + messageId + automationId
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';

const log = createLogger({ module: 'keyword-automation' });

// ── In-memory cooldown tracker ────────────────────────────────────────────────
// Key: `${workspaceId}:${contactId}:${keyword}`  →  timestamp of last trigger
const cooldownStore = new Map<string, number>();

// Cleanup stale cooldowns every 5 minutes to prevent memory leaks
setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [key, ts] of cooldownStore) {
        if (ts < cutoff) cooldownStore.delete(key);
    }
}, 5 * 60 * 1000);

// ── Text normalization ─────────────────────────────────────────────────────────
/** Normalize text: lowercase, trim, remove punctuation */
function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ');   // Collapse multiple spaces
}

// ── Main matching engine ───────────────────────────────────────────────────────

/**
 * Find the best matching keyword automation for an inbound message.
 * - Loads all active automations for the workspace in one DB query.
 * - Normalizes input text.
 * - Sorts candidates by keyword length (longest = most specific) before evaluating.
 * - Returns the first match, or null if none.
 */
export async function findMatchingKeywordAutomation(
    workspaceId: string,
    text: string
): Promise<{
    automation: any;
    matchedKeyword: string;
} | null> {
    const normalized = normalizeText(text);

    const automations = await (prisma as any).keywordAutomation.findMany({
        where: { workspaceId, isActive: true },
        include: {
            media: {
                select: { id: true, url: true, type: true, name: true, mimeType: true, storageKey: true },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    if (!automations.length) return null;

    // Sort by keyword length descending (longest/most-specific wins on ties)
    const sorted = [...automations].sort(
        (a: any, b: any) => b.keyword.length - a.keyword.length
    );

    for (const auto of sorted) {
        const normalizedKeyword = normalizeText(auto.keyword);
        let matches = false;

        if (auto.matchType === 'exact') {
            matches = normalized === normalizedKeyword;
        } else {
            // "contains" — default
            matches = normalized.includes(normalizedKeyword);
        }

        if (matches) {
            return { automation: auto, matchedKeyword: auto.keyword };
        }
    }

    return null;
}

/**
 * Check and enforce the per-contact cooldown for an automation.
 * Returns true if the message should be rate-limited (i.e. still in cooldown).
 */
export function isOnCooldown(
    workspaceId: string,
    contactId: string,
    keyword: string,
    cooldownSec: number
): boolean {
    const key = `${workspaceId}:${contactId}:${keyword}`;
    const lastTriggered = cooldownStore.get(key);
    if (!lastTriggered) return false;
    return Date.now() - lastTriggered < cooldownSec * 1000;
}

/**
 * Set the cooldown timestamp for a contact + keyword combination.
 */
export function setCooldown(
    workspaceId: string,
    contactId: string,
    keyword: string
): void {
    const key = `${workspaceId}:${contactId}:${keyword}`;
    cooldownStore.set(key, Date.now());
}

/**
 * Log a keyword automation trigger to the database for analytics.
 * Fire-and-forget — failures log a warning but don't block message processing.
 */
export async function logAutomationTrigger(params: {
    workspaceId: string;
    automationId: string;
    keyword: string;
    matchType: string;
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
        include: { media: { select: { id: true, name: true, url: true, type: true } } },
        orderBy: { createdAt: 'desc' },
    });
}

export async function getKeywordAutomationById(workspaceId: string, id: string) {
    const auto = await (prisma as any).keywordAutomation.findFirst({
        where: { id, workspaceId },
        include: { media: { select: { id: true, name: true, url: true, type: true } } },
    });
    if (!auto) throw new Error('Automation not found');
    return auto;
}

export async function getKeywordAutomationStats(workspaceId: string, id: string) {
    // Verify ownership
    await getKeywordAutomationById(workspaceId, id);

    const [logs, lastLog] = await Promise.all([
        (prisma as any).automationLog.count({ where: { automationId: id } }),
        (prisma as any).automationLog.findFirst({
            where: { automationId: id },
            orderBy: { triggeredAt: 'desc' },
            select: { triggeredAt: true },
        }),
    ]);

    return {
        triggerCount: logs,
        lastTriggeredAt: lastLog?.triggeredAt ?? null,
    };
}

export async function createKeywordAutomation(workspaceId: string, data: {
    keyword: string;
    matchType?: string;
    replyText: string;
    mediaId?: string | null;
    intent?: string | null;
    cooldownSec?: number;
}) {
    return (prisma as any).keywordAutomation.create({
        data: {
            workspaceId,
            keyword: data.keyword.trim().toLowerCase(),
            matchType: data.matchType ?? 'contains',
            replyText: data.replyText,
            mediaId: data.mediaId ?? null,
            intent: data.intent ?? null,
            cooldownSec: data.cooldownSec ?? 30,
            isActive: true,
        },
        include: { media: { select: { id: true, name: true, url: true, type: true } } },
    });
}

export async function updateKeywordAutomation(workspaceId: string, id: string, data: {
    keyword?: string;
    matchType?: string;
    replyText?: string;
    mediaId?: string | null;
    intent?: string | null;
    isActive?: boolean;
    cooldownSec?: number;
}) {
    const updateData: any = { ...data };
    if (data.keyword !== undefined) {
        updateData.keyword = data.keyword.trim().toLowerCase();
    }
    return (prisma as any).keywordAutomation.update({
        where: { id, workspaceId },
        data: updateData,
        include: { media: { select: { id: true, name: true, url: true, type: true } } },
    });
}

export async function deleteKeywordAutomation(workspaceId: string, id: string) {
    await (prisma as any).keywordAutomation.delete({ where: { id, workspaceId } });
}
