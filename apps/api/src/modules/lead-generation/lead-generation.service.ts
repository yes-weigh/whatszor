/**
 * lead-generation.service.ts
 *
 * Business logic for the Lead Generation module.
 * Handles: rate limits, preview, job creation, listing, detail, convert, delete.
 *
 * Design constraints:
 *  - Does NOT touch existing crm/contact logic directly — uses Prisma directly with
 *    the same dedup constraints as contact.service (@@unique[workspaceId, phone]).
 *  - All DB writes are workspace-scoped.
 *  - Rate limiting is enforced in Redis before any job creation.
 */

import { prisma } from '../../prisma/client';
import { getQueue, QueueName } from '../../queues/index';
import { getRedisClient } from '../../core/redis';
import { createLogger } from '../../core/logger';
import { logEvent } from '../../core/event-logger';
import { env } from '../../env';
import { previewPlaces } from './places.client';
import type { SearchPreview } from './places.client';

const log = createLogger({ module: 'lead-generation-service' });

// ── Rate Limit Constants ──────────────────────────────────────────────────────
const HOURLY_SEARCH_LIMIT      = 10;
const DAILY_SEARCH_LIMIT       = 50;
const HOURLY_PREVIEW_LIMIT     = 20;
const MAX_RESULTS_CAP          = 20;   // default cap for normal searches
const MAX_RESULTS_CAP_PREMIUM  = 100;  // cap when fetchMaximum is enabled
const DEFAULT_MAX_RESULTS      = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the configured API key or throws 503. */
export function requirePlacesApiKey(): string {
    const key = env.GOOGLE_PLACES_API_KEY;
    if (!key) {
        const err = new Error('Lead generation is not configured. Please add GOOGLE_PLACES_API_KEY to your environment.');
        (err as any).statusCode = 503;
        (err as any).code = 'SERVICE_UNAVAILABLE';
        throw err;
    }
    return key;
}

/**
 * Atomically increment a Redis rate-limit counter and set TTL on first increment.
 * Returns the new counter value.
 */
async function incrementRateLimit(key: string, ttlSeconds: number): Promise<number> {
    const redis = getRedisClient();
    const count = await redis.incr(key);
    if (count === 1) {
        await redis.expire(key, ttlSeconds);
    }
    return count;
}

async function checkSearchRateLimit(workspaceId: string): Promise<void> {
    const redis = getRedisClient();

    const hourlyKey = `lead_gen:search:hourly:${workspaceId}`;
    const dailyKey  = `lead_gen:search:daily:${workspaceId}`;

    const [hourly, daily] = await Promise.all([
        redis.get(hourlyKey).then(v => parseInt(v || '0', 10)),
        redis.get(dailyKey).then(v => parseInt(v || '0', 10)),
    ]);

    if (hourly >= HOURLY_SEARCH_LIMIT) {
        const err = new Error(`Rate limit exceeded: max ${HOURLY_SEARCH_LIMIT} lead searches per hour.`);
        (err as any).statusCode = 429;
        (err as any).code = 'RATE_LIMIT_EXCEEDED';
        throw err;
    }

    if (daily >= DAILY_SEARCH_LIMIT) {
        const err = new Error(`Rate limit exceeded: max ${DAILY_SEARCH_LIMIT} lead searches per day.`);
        (err as any).statusCode = 429;
        (err as any).code = 'RATE_LIMIT_EXCEEDED';
        throw err;
    }

    // Increment both counters
    await Promise.all([
        incrementRateLimit(hourlyKey, 3_600),
        incrementRateLimit(dailyKey, 86_400),
    ]);
}

async function checkPreviewRateLimit(workspaceId: string): Promise<void> {
    const key = `lead_gen:preview:hourly:${workspaceId}`;
    const redis = getRedisClient();
    const current = await redis.get(key).then(v => parseInt(v || '0', 10));

    if (current >= HOURLY_PREVIEW_LIMIT) {
        const err = new Error(`Rate limit exceeded: max ${HOURLY_PREVIEW_LIMIT} previews per hour.`);
        (err as any).statusCode = 429;
        (err as any).code = 'RATE_LIMIT_EXCEEDED';
        throw err;
    }

    await incrementRateLimit(key, 3_600);
}

// ── Service Functions ─────────────────────────────────────────────────────────

/**
 * Lightweight preview — runs a text search, returns sample results.
 * Does NOT create any LeadList or Lead records.
 */
export async function previewLeadSearch(
    workspaceId: string,
    query: string,
): Promise<SearchPreview> {
    await checkPreviewRateLimit(workspaceId);
    const apiKey = requirePlacesApiKey();

    log.info({ workspaceId, query }, 'Lead generation preview requested');

    return previewPlaces(query, apiKey);
}

/**
 * Creates a LeadList in PENDING state and enqueues a BullMQ job to process it.
 * Returns the new LeadList immediately (202 pattern).
 */
export async function createLeadList(
    workspaceId: string,
    input: { query: string; name?: string; maxResults?: number; fetchMaximum?: boolean },
) {
    await checkSearchRateLimit(workspaceId);
    requirePlacesApiKey(); // fail fast before creating any records

    const cap = input.fetchMaximum ? MAX_RESULTS_CAP_PREMIUM : MAX_RESULTS_CAP;
    const maxResults = Math.min(input.maxResults ?? (input.fetchMaximum ? MAX_RESULTS_CAP_PREMIUM : DEFAULT_MAX_RESULTS), cap);

    const leadList = await prisma.leadList.create({
        data: {
            workspaceId,
            query: input.query.trim(),
            name: input.name?.trim() || null,
            status: 'PENDING',
        },
    });

    log.info({ workspaceId, leadListId: leadList.id, query: leadList.query }, 'LeadList created');
    
    // Log platform event
    await logEvent(workspaceId, 'lead_list_created', 'lead-generation', { 
        leadListId: leadList.id, query: leadList.query 
    });

    // Enqueue job — store the returned job ID back on the LeadList
    const job = await getQueue(QueueName.LEAD_GENERATION).add('process-lead-list', {
        workspaceId,
        leadListId: leadList.id,
        query: leadList.query,
        maxResults,
    });

    // Store job.id for observability (non-blocking — ignore if it fails)
    await prisma.leadList.update({
        where: { id: leadList.id },
        data: { jobId: job.id?.toString() ?? null },
    }).catch(() => {});

    return { ...leadList, jobId: job.id?.toString() };
}

/**
 * Lists all LeadLists for a workspace, newest first.
 */
export async function getLeadLists(
    workspaceId: string,
    options: { skip?: number; take?: number } = {},
) {
    const skip = options.skip ?? 0;
    const take = Math.min(options.take ?? 20, 100);

    const [items, total] = await Promise.all([
        prisma.leadList.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            skip,
            take,
            select: {
                id: true,
                name: true,
                query: true,
                status: true,
                totalFound: true,
                withPhone: true,
                converted: true,
                jobId: true,
                processingStartedAt: true,
                completedAt: true,
                errorReason: true,
                createdAt: true,
            },
        }),
        prisma.leadList.count({ where: { workspaceId } }),
    ]);

    return { items, total };
}

/**
 * Returns a single LeadList with its leads, supporting pagination + filter.
 */
export async function getLeadList(
    workspaceId: string,
    leadListId: string,
    options: {
        skip?: number;
        take?: number;
        filter?: 'all' | 'with_phone' | 'converted' | 'raw';
    } = {},
) {
    const list = await prisma.leadList.findFirst({
        where: { id: leadListId, workspaceId },
    });

    if (!list) {
        const err = new Error('Lead list not found');
        (err as any).statusCode = 404;
        (err as any).code = 'NOT_FOUND';
        throw err;
    }

    const skip = options.skip ?? 0;
    const take = Math.min(options.take ?? 50, 200);

    // Build leads WHERE clause from filter
    const filter = options.filter ?? 'all';
    const leadsWhere: Record<string, unknown> = { leadListId };
    if (filter === 'with_phone')  leadsWhere.hasPhone = true;
    if (filter === 'converted')   leadsWhere.status = 'CONVERTED';
    if (filter === 'raw')         leadsWhere.status = 'RAW';

    const [leads, leadsTotal] = await Promise.all([
        prisma.lead.findMany({
            where: leadsWhere,
            orderBy: { createdAt: 'asc' },
            skip,
            take,
            select: {
                id: true,
                name: true,
                phone: true,
                hasPhone: true,
                address: true,
                website: true,
                googlePlaceId: true,
                status: true,
                contactId: true,
                createdAt: true,
            },
        }),
        prisma.lead.count({ where: leadsWhere }),
    ]);

    return { ...list, leads, leadsTotal };
}

/**
 * Converts RAW leads with hasPhone=true into CRM Contact records.
 * - Checks contacts table for phone uniqueness before inserting.
 * - Marks converted/skipped leads accordingly.
 * - Updates LeadList.converted count.
 *
 * Optional audience integration:
 *  - `createAudience: true` → auto-creates an Audience named after the lead list
 *    (reuses existing if this leadListId is already linked).
 *  - `audienceId` → adds newly converted contacts to an existing audience.
 */
export async function convertLeads(
    workspaceId: string,
    leadListId: string,
    input: {
        leadIds?: string[];
        skipExisting?: boolean;
        createAudience?: boolean;
        audienceId?: string;
    } = {},
) {
    const list = await prisma.leadList.findFirst({
        where: { id: leadListId, workspaceId },
    });

    if (!list) {
        const err = new Error('Lead list not found');
        (err as any).statusCode = 404;
        (err as any).code = 'NOT_FOUND';
        throw err;
    }

    // Determine which leads to convert
    const leadsWhere: Record<string, unknown> = {
        leadListId,
        workspaceId,
        hasPhone: true,          // only leads with a phone number are eligible
        status: 'RAW',
    };
    if (input.leadIds?.length) {
        leadsWhere.id = { in: input.leadIds };
    }

    const leads = await prisma.lead.findMany({ where: leadsWhere });

    if (leads.length === 0) {
        return { converted: 0, skipped: 0, failed: 0, skippedReasons: {}, audienceId: input.audienceId ?? null };
    }

    let converted = 0;
    let skipped = 0;
    let failed = 0;
    const skippedReasons: Record<string, number> = {};
    const newContactIds: string[] = [];

    for (const lead of leads) {
        if (!lead.phone) continue; // safety guard (hasPhone filter should prevent this)

        try {
            // Check if contact already exists for this phone in the workspace
            const existing = await prisma.contact.findFirst({
                where: { workspaceId, phone: lead.phone },
                select: { id: true },
            });

            if (existing && input.skipExisting !== false) {
                await prisma.lead.update({
                    where: { id: lead.id },
                    data: { status: 'SKIPPED' },
                });
                skipped++;
                skippedReasons['phone_exists'] = (skippedReasons['phone_exists'] ?? 0) + 1;
                // Still add the existing contact to the audience if requested
                newContactIds.push(existing.id);
                continue;
            }

            // Create the CRM contact
            const contact = await prisma.contact.create({
                data: {
                    workspaceId,
                    firstName: lead.name,
                    phone: lead.phone,
                    customData: {
                        source: 'google_places',
                        address: lead.address ?? null,
                        leadListId,
                        googlePlaceId: lead.googlePlaceId ?? null,
                    },
                },
            });

            await prisma.lead.update({
                where: { id: lead.id },
                data: { status: 'CONVERTED', contactId: contact.id },
            });

            newContactIds.push(contact.id);
            converted++;
        } catch (err: any) {
            // Handle unique constraint violation (race condition — phone added concurrently)
            if (err?.code === 'P2002') {
                await prisma.lead.update({
                    where: { id: lead.id },
                    data: { status: 'SKIPPED' },
                }).catch(() => {});
                skipped++;
                skippedReasons['phone_exists'] = (skippedReasons['phone_exists'] ?? 0) + 1;
            } else {
                log.error({ leadId: lead.id, err }, 'Failed to convert lead to contact');
                failed++;
            }
        }
    }

    if (converted > 0) {
        await prisma.leadList.update({
            where: { id: leadListId },
            data: { converted: { increment: converted } },
        }).catch(() => {});

        // Log platform event
        await logEvent(workspaceId, 'leads_converted', 'lead-generation', {
            leadListId,
            convertedCount: converted,
            skippedCount: skipped,
            failedCount: failed
        });
    }

    log.info({ leadListId, converted, skipped, failed }, 'Lead conversion complete');

    // ── Audience integration ──────────────────────────────────────────────────
    let resolvedAudienceId: string | null = input.audienceId ?? null;

    if ((input.createAudience || resolvedAudienceId) && newContactIds.length > 0) {
        try {
            if (input.createAudience && !resolvedAudienceId) {
                // Dedup: reuse existing audience if this leadListId is already linked
                const existing = await prisma.audience.findFirst({
                    where: { workspaceId, leadListId },
                    select: { id: true },
                });

                if (existing) {
                    resolvedAudienceId = existing.id;
                } else {
                    // Create a new audience named after the lead list
                    const audience = await prisma.audience.create({
                        data: {
                            workspaceId,
                            name: list.name || list.query,
                            sourceType: 'lead_list',
                            leadListId,
                            memberCount: 0,
                        },
                    });
                    resolvedAudienceId = audience.id;
                }
            }

            if (resolvedAudienceId) {
                const result = await prisma.audienceMember.createMany({
                    data: newContactIds.map(contactId => ({
                        audienceId: resolvedAudienceId as string,
                        contactId,
                        sourceType: 'lead_list',
                    })),
                    skipDuplicates: true,
                });

                if (result.count > 0) {
                    await prisma.audience.update({
                        where: { id: resolvedAudienceId },
                        data: { memberCount: { increment: result.count } },
                    });
                }

                log.info({ audienceId: resolvedAudienceId, added: result.count }, 'Contacts added to audience after conversion');
            }
        } catch (audienceErr) {
            // Non-fatal: log but don't fail the conversion
            log.error({ audienceErr }, 'Failed to add converted contacts to audience — non-fatal');
        }
    }

    return { converted, skipped, failed, skippedReasons, audienceId: resolvedAudienceId };
}

/**
 * Deletes a LeadList and all its leads.
 * Converted contacts are NOT deleted (onDelete: SetNull on contactId).
 */
export async function deleteLeadList(workspaceId: string, leadListId: string): Promise<void> {
    const list = await prisma.leadList.findFirst({
        where: { id: leadListId, workspaceId },
        select: { id: true },
    });

    if (!list) {
        const err = new Error('Lead list not found');
        (err as any).statusCode = 404;
        (err as any).code = 'NOT_FOUND';
        throw err;
    }

    await prisma.leadList.delete({ where: { id: leadListId } });
    log.info({ workspaceId, leadListId }, 'LeadList deleted');
}
