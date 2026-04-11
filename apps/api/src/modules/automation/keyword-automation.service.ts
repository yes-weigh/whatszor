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
 *
 * Performance:
 *  - Redis cache: automation list cached per workspace (30s TTL)
 *  - Regex cache: compiled RegExp objects cached in-process by automationId
 *  - Automation log: batched writes (fire-and-forget, 2s flush)
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';
import { getRedisClient } from '../../core/redis';

const log = createLogger({ module: 'keyword-automation' });

// ── Cooldown store (in-process, per-worker) ──────────────────────────────────
const cooldownStore = new Map<string, number>();

setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [key, ts] of cooldownStore) {
        if (ts < cutoff) cooldownStore.delete(key);
    }
}, 5 * 60 * 1000);

// ── Redis automation cache ────────────────────────────────────────────────────
// Eliminates the most expensive per-message DB query: a full automation
// table scan with deep joins. Cached for 30s — stale for at most 30s after
// a create/update/delete, which is acceptable for keyword routing.

const KW_CACHE_KEY_PREFIX = 'kw:automations:';
const KW_CACHE_TTL_SEC = 30;

async function fetchAutomationsForWorkspace(workspaceId: string): Promise<any[]> {
    const redis = getRedisClient();
    const cacheKey = `${KW_CACHE_KEY_PREFIX}${workspaceId}`;

    const hit = await redis.get(cacheKey);
    if (hit) {
        try {
            return JSON.parse(hit);
        } catch {
            // Cache corruption — fall through to DB
        }
    }

    const automations = await (prisma as any).keywordAutomation.findMany({
        where: { workspaceId, isActive: true },
        include: {
            media: { select: { id: true, url: true, type: true, name: true, mimeType: true, storageKey: true } },
            template: {
                include: {
                    versions: {
                        orderBy: { version: 'desc' },
                        take: 1,
                        include: { media: true, buttons: true },
                    },
                },
            },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    // Cache asynchronously — don't let a Redis write slow down the response
    redis.set(cacheKey, JSON.stringify(automations), 'EX', KW_CACHE_TTL_SEC).catch(() => {});
    return automations;
}

/**
 * Invalidate the Redis cache for a workspace's automations.
 * Must be called on every create / update / delete to prevent stale routing.
 */
export async function invalidateAutomationCache(workspaceId: string): Promise<void> {
    try {
        const redis = getRedisClient();
        await redis.del(`${KW_CACHE_KEY_PREFIX}${workspaceId}`);
        // Also purge in-process regex cache for this workspace's patterns
        for (const key of regexCache.keys()) {
            if (key.startsWith(`${workspaceId}:`)) {
                regexCache.delete(key);
            }
        }
    } catch (err) {
        log.warn({ err, workspaceId }, 'Failed to invalidate automation cache');
    }
}

// ── In-process compiled regex cache ──────────────────────────────────────────
// `new RegExp(pattern, 'i')` is NOT free — it compiles a finite automaton.
// Caching by automationId avoids recompilation on every inbound message.

const regexCache = new Map<string, RegExp>();

function getCompiledRegex(workspaceId: string, automationId: string, pattern: string): RegExp {
    const key = `${workspaceId}:${automationId}:${pattern}`;
    let compiled = regexCache.get(key);
    if (!compiled) {
        compiled = new RegExp(pattern, 'i');
        regexCache.set(key, compiled);
    }
    return compiled;
}

// ── Automation log batch buffer ───────────────────────────────────────────────
// Instead of an individual automationLog.create() per trigger (which is on
// the hot path), we buffer records and flush as a single createMany() call.

const LOG_BATCH_SIZE = 20;
const LOG_FLUSH_INTERVAL_MS = 3_000;

interface AutomationLogRecord {
    id: string;
    workspaceId: string;
    automationId: string;
    keyword: string;
    matchType: string;
    replyType: string;
    priority: number;
    executionTimeMs: number;
    contactId: string | null;
    messageId: string | null;
}

let logBuffer: AutomationLogRecord[] = [];
let logFlushTimer: NodeJS.Timeout | null = null;
let isLogFlushing = false;
let isShuttingDown = false;

export function setAutomationLogShuttingDown() {
    isShuttingDown = true;
}

export async function flushPendingAutomationLogs(): Promise<void> {
    if (logBuffer.length === 0) return;
    if (isLogFlushing) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return flushPendingAutomationLogs();
    }
    
    isLogFlushing = true;
    const batch = logBuffer.splice(0, logBuffer.length);
    
    try {
        await Promise.race([
            (prisma as any).automationLog.createMany({ data: batch, skipDuplicates: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Flush timeout')), 5000))
        ]);
    } catch (err) {
        log.warn({ err, count: batch.length }, 'Automation log batch flush failed');
        if (logBuffer.length < 500) {
            logBuffer.unshift(...batch.slice(0, 500 - logBuffer.length));
        }
    } finally {
        isLogFlushing = false;
    }
}

function scheduleLogFlush(): void {
    if (logFlushTimer) return;
    logFlushTimer = setTimeout(async () => {
        logFlushTimer = null;
        await flushPendingAutomationLogs();
    }, LOG_FLUSH_INTERVAL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────

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

    // Cache-first load — no DB hit if cache is warm (30s TTL)
    const automations = await fetchAutomationsForWorkspace(workspaceId);
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
                    // ReDoS protection: skip long inputs
                    if (text.length > 500) {
                        matches = false;
                        break;
                    }
                    // Use cached compiled RegExp — no recompilation on each call
                    const regex = getCompiledRegex(workspaceId, auto.id, auto.keyword);
                    matches = regex.test(text);
                } catch (err) {
                    log.warn({ err, keyword: auto.keyword }, 'Invalid regex pattern in automation');
                }
                break;
            case 'AI_INTENT':
                // AI_INTENT is handled externally; fallback to CONTAINS
                matches = normalized.includes(normalizeText(auto.keyword));
                break;
            default:
                matches = normalized.includes(normalizeText(auto.keyword));
        }

        if (matches) {
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

/**
 * Fire-and-forget automation trigger log using a batch buffer.
 * Never awaited on the hot path — safe to call without `await`.
 */
export function logAutomationTrigger(params: {
    workspaceId: string;
    automationId: string;
    keyword: string;
    matchType: string;
    replyType: string;
    priority: number;
    executionTimeMs?: number;
    contactId?: string | null;
    messageId?: string | null;
}): void {
    const record: AutomationLogRecord = {
        id: require('crypto').randomUUID(),
        workspaceId: params.workspaceId,
        automationId: params.automationId,
        keyword: params.keyword,
        matchType: params.matchType,
        replyType: params.replyType,
        priority: params.priority,
        executionTimeMs: params.executionTimeMs ?? 0,
        contactId: params.contactId ?? null,
        messageId: params.messageId ?? null,
    };

    if (isShuttingDown) {
        (prisma as any).automationLog.create({ data: record }).catch((err: any) => log.error({ err }, 'Shutdown automation log failed'));
        return;
    }

    logBuffer.push(record);

    if (logBuffer.length >= LOG_BATCH_SIZE) {
        if (logFlushTimer) {
            clearTimeout(logFlushTimer);
            logFlushTimer = null;
        }
        flushPendingAutomationLogs().catch(() => {});
    } else {
        scheduleLogFlush();
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

    const result = await (prisma as any).keywordAutomation.create({
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

    // Invalidate cache so the new rule is picked up immediately
    await invalidateAutomationCache(workspaceId);
    return result;
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

    const result = await (prisma as any).keywordAutomation.update({
        where: { id, workspaceId },
        data: updateData,
        include: {
            media: { select: { id: true, name: true, url: true, type: true } },
            template: { select: { id: true, name: true } }
        },
    });

    await invalidateAutomationCache(workspaceId);
    return result;
}

export async function deleteKeywordAutomation(workspaceId: string, id: string) {
    await (prisma as any).keywordAutomation.delete({ where: { id, workspaceId } });
    await invalidateAutomationCache(workspaceId);
}
