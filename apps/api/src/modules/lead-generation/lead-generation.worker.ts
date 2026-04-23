/**
 * lead-generation.worker.ts — BullMQ job processor
 *
 * Processes lead generation jobs enqueued by the service layer.
 *
 * Pipeline:
 *   1. Mark LeadList as PROCESSING + set processingStartedAt
 *   2. searchPlaces(query, maxResults) → place summaries
 *   3. Guard: if 0 results → mark FAILED (no leads to show)
 *   4. Update LeadList.totalFound
 *   5. For each place: getPlaceDetail → normalize phone → create Lead
 *   6. Mark LeadList as READY + set completedAt + update withPhone count
 *   7. Push SSE event to the workspace (lead_list.ready / lead_list.failed)
 *
 * Error handling:
 *   - Terminal errors (403, 0 results) → FAILED immediately, no retry
 *   - Transient errors (429, network) → thrown so BullMQ can retry (exponential backoff)
 *   - Per-place detail errors → logged and skipped (lead stored with null phone)
 */

import type { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';
import { emitToWorkspace } from '../../core/realtime';
import { logEvent } from '../../core/event-logger';
import { searchPlaces, getPlaceDetail, gridSearchPlaces } from './places.client';
import { normalizeToE164 } from './phone.utils';
import { requirePlacesApiKey } from './lead-generation.service';
import { QueryCacheService } from './query-cache.service';
import { QueryDeduplicator } from './query-deduplicator';

const log = createLogger({ module: 'lead-generation-worker' });

export interface LeadGenerationJobData {
    workspaceId: string;
    leadListId: string;
    query: string;
    keyword?: string;
    lat?: number;
    lng?: number;
    planId?: string;
    maxResults: number;
    traceId?: string;
}

const MAX_DETAILS_PER_JOB = 500; // Grid search can surface hundreds of unique results

export async function processLeadGenerationJob(job: Job<LeadGenerationJobData>): Promise<void> {
    const { workspaceId, leadListId, query, keyword, lat, lng, planId, maxResults } = job.data;

    log.info({ jobId: job.id, leadListId, query }, 'Lead generation job started');

    if (!workspaceId || !leadListId || !query) {
        log.warn({ jobId: job.id }, 'Invalid job payload — missing required fields');
        return;
    }

    // ── 1. Mark PROCESSING ───────────────────────────────────────────────────
    await prisma.leadList.update({
        where: { id: leadListId },
        data: {
            status: 'PROCESSING',
            processingStartedAt: new Date(),
        },
    });

    let apiKey: string;
    try {
        apiKey = requirePlacesApiKey();
    } catch {
        const reason = 'GOOGLE_PLACES_API_KEY not configured';
        await markFailed(leadListId, workspaceId, reason);
        return; // non-retryable
    }

    // ── 2. Text Search (with Cache) ──────────────────────────────────────────
    let summaries;
    try {
        const fetchMax = Math.min(maxResults, MAX_DETAILS_PER_JOB);
        const useGridSearch = maxResults >= 100; // grid search when fetchMaximum is enabled

        if (useGridSearch) {
            // Parse "grocery shop in Madurai" → keyword="grocery shop", city="Madurai"
            const inMatch = query.match(/^(.+?)\s+in\s+(.+)$/i);
            const kw   = (inMatch ? inMatch[1] : keyword || query).trim();
            const city = (inMatch ? inMatch[2] : query).trim();

            summaries = await gridSearchPlaces(kw, city, apiKey, {
                cityLat: lat,
                cityLng: lng,
                cityRadiusKm: 6,   // 6km radius covers most Indian cities
                cellSizeKm: 0.8,   // 800m cells
                maxCells: 30,      // 30 cells × up to 3 pages = ~90 API calls max
            });

            log.info({ leadListId, keyword: kw, city, gridResults: summaries.length }, 'Grid search complete');
        } else if (keyword && lat !== undefined && lng !== undefined) {
            summaries = await QueryCacheService.searchPlacesCached(query, keyword, lat, lng, fetchMax, apiKey);
        } else {
            summaries = await searchPlaces(query, fetchMax, apiKey);
        }
    } catch (err: any) {
        log.error({ err, leadListId }, 'Places text search failed');

        // 403 = bad key → non-retryable
        if (err?.status === 403) {
            await markFailed(leadListId, workspaceId, `Places API auth error: ${err.message}`);
            return;
        }

        // Other errors → re-throw for BullMQ retry
        throw err;
    }

    // ── 3. Guard: empty results ──────────────────────────────────────────────
    if (summaries.length === 0) {
        const reason = `No results found for query: "${query}"`;
        log.warn({ leadListId, query }, reason);
        await markFailed(leadListId, workspaceId, reason);
        if (planId) {
            await prisma.leadQueryPlan.update({
                where: { id: planId },
                data: { status: 'DONE', actualLeads: 0, actualDupes: 0 }
            }).catch(() => {});
        }
        return;
    }

    // ── 4. Update totalFound ─────────────────────────────────────────────────
    await prisma.leadList.update({
        where: { id: leadListId },
        data: { totalFound: summaries.length },
    });

    log.info({ leadListId, totalFound: summaries.length }, 'Places search complete');

    // ── 5. Fetch details + dedup + store leads ───────────────────────────────
    let withPhone = 0;
    let processedCount = 0;
    let duplicatesSeen = 0;
    let killSwitchFired = false;
    let actualLeads = 0;

    await QueryDeduplicator.warmUpCache(workspaceId);

    for (const summary of summaries) {
        if (killSwitchFired) break;

        processedCount++;

        // L1 Dedup Check (PlaceID) early to avoid API call
        const isDupL1 = await QueryDeduplicator.isDuplicate(workspaceId, { googlePlaceId: summary.placeId, name: summary.displayName });
        if (isDupL1) {
            duplicatesSeen++;
            checkKillSwitch();
            continue;
        }

        let detail = null;
        try {
            detail = await getPlaceDetail(summary.placeId, apiKey);
        } catch (err: any) {
            log.warn({ placeId: summary.placeId, err: err.message }, 'Failed to fetch place detail');
        }

        // Normalize phone number
        const rawPhone = detail?.phone ?? null;
        const phone = normalizeToE164(rawPhone);
        const hasPhone = phone !== null;
        
        // Final Dedup check
        const isDupFull = await QueryDeduplicator.isDuplicate(workspaceId, {
            googlePlaceId: summary.placeId,
            phone,
            lat: detail?.lat,
            lng: detail?.lng,
            name: detail?.name || summary.displayName
        });

        if (isDupFull) {
            duplicatesSeen++;
            checkKillSwitch();
            continue;
        }

        if (hasPhone) withPhone++;
        actualLeads++;

        // Store the lead
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rawDataJson = detail?.raw ? (detail.raw as any) : undefined;
            await prisma.lead.create({
                data: {
                    workspaceId,
                    leadListId,
                    name: detail?.name || summary.displayName,
                    phone,
                    hasPhone,
                    address: detail?.address ?? null,
                    website: detail?.website ?? null,
                    lat: detail?.lat,
                    lng: detail?.lng,
                    types: (detail?.raw as any)?.types || [],
                    googlePlaceId: summary.placeId,
                    rawData: rawDataJson,
                    status: 'RAW',
                },
            });

            await QueryDeduplicator.markAsSeen(workspaceId, {
                googlePlaceId: summary.placeId,
                phone,
                lat: detail?.lat,
                lng: detail?.lng,
                name: detail?.name || summary.displayName
            });
        } catch (err: any) {
            if (err?.code === 'P2002') {
                log.debug({ placeId: summary.placeId, leadListId }, 'Duplicate place skipped');
            } else {
                log.error({ err, placeId: summary.placeId }, 'Failed to create Lead record');
            }
        }

        checkKillSwitch();

        // Throttle: small delay between detail calls
        await delay(150);
    }

    function checkKillSwitch() {
        // Require a larger sample (30) and higher dup threshold (90%) for grid searches,
        // since grid overlap is deduped at the search level — remaining dupes are truly saturated.
        const minSample = maxResults >= 100 ? 30 : 10;
        const threshold = maxResults >= 100 ? 0.90 : 0.70;
        if (processedCount >= minSample) {
            const dupRate = duplicatesSeen / processedCount;
            if (dupRate > threshold) {
                killSwitchFired = true;
                log.warn({ leadListId, dupRate, processedCount }, 'Kill-switch fired due to high duplicate rate');
            }
        }
    }

    // ── 6. Mark READY ────────────────────────────────────────────────────────
    await prisma.leadList.update({
        where: { id: leadListId },
        data: {
            status: 'READY',
            withPhone,
            completedAt: new Date(),
        },
    });

    if (planId) {
        try {
            const plan = await prisma.leadQueryPlan.findUnique({ where: { id: planId } });
            if (plan) {
                await prisma.leadQueryPlan.update({
                    where: { id: planId },
                    data: {
                        status: killSwitchFired ? 'KILLED' : 'DONE',
                        actualLeads,
                        actualDupes: duplicatesSeen,
                        killSwitchFired,
                        leadListId
                    }
                });

                // Phase 4A: Self-Improvement & Learning Loop
                const yieldRatio = plan.estimatedLeads > 0 ? actualLeads / plan.estimatedLeads : 0;
                
                // Fetch or create QueryPerformanceMetric
                let metric = await prisma.queryPerformanceMetric.findUnique({
                    where: {
                        workspaceId_city_keyword: {
                            workspaceId,
                            city: plan.city,
                            keyword: plan.keyword
                        }
                    }
                });

                if (!metric) {
                    metric = await prisma.queryPerformanceMetric.create({
                        data: {
                            workspaceId,
                            city: plan.city,
                            keyword: plan.keyword,
                            yieldMultiplier: 1.0,
                            runCount: 0
                        }
                    });
                }

                let newMultiplier = metric.yieldMultiplier;
                if (killSwitchFired) {
                    newMultiplier = metric.yieldMultiplier * 0.6;
                } else {
                    newMultiplier = 0.7 * metric.yieldMultiplier + 0.3 * yieldRatio;
                }

                await prisma.queryPerformanceMetric.update({
                    where: { id: metric.id },
                    data: {
                        yieldMultiplier: newMultiplier,
                        runCount: { increment: 1 }
                    }
                });

                // Cooldown logic
                if (killSwitchFired || yieldRatio < 0.1) {
                    const { getRedisClient } = require('../../core/redis');
                    const redis = getRedisClient();
                    const cooldownKey = `lead:cooldown:${workspaceId}:${plan.city}:${plan.keyword}`;
                    await redis.set(cooldownKey, '1', 'EX', 24 * 60 * 60);
                    log.info({ planId, keyword: plan.keyword, city: plan.city }, 'Cooldown triggered for query');
                }
            }
        } catch (e: any) {
            log.error({ err: e, planId }, 'Failed to update LeadQueryPlan or metrics');
        }
    }

    log.info({ leadListId, withPhone, actualLeads, duplicatesSeen, killSwitchFired }, 'LeadList processing complete');

    // ── 7. SSE push & Auto-Convert ───────────────────────────────────────────
    const list = await prisma.leadList.findUnique({
        where: { id: leadListId },
        select: { name: true, query: true, targetAudienceId: true },
    });

    if (list?.targetAudienceId) {
        log.info({ leadListId, audienceId: list.targetAudienceId }, 'Auto-converting to specified audience block');
        try {
            const { convertLeads } = require('./lead-generation.service');
            await convertLeads(workspaceId, leadListId, {
                skipExisting: true,
                createAudience: false,
                audienceId: list.targetAudienceId,
                ignoreVisibleLimit: true
            });
            log.info({ leadListId }, 'Auto-conversion completed within worker');
        } catch(e: any) {
            log.error({ err: e, leadListId }, 'Failed to auto-convert leads within worker');
        }
    }

    emitToWorkspace(workspaceId, 'lead_list.ready', {
        leadListId,
        name: list?.name || list?.query || query,
        totalFound: summaries.length,
        withPhone,
    });

    // Log platform event
    await logEvent(workspaceId, 'lead_list_ready', 'lead-generation-worker', {
        leadListId,
        query,
        totalFound: summaries.length,
        withPhone,
        killSwitchFired
    }, job.data.traceId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markFailed(
    leadListId: string,
    workspaceId: string,
    errorReason: string,
): Promise<void> {
    await prisma.leadList.update({
        where: { id: leadListId },
        data: {
            status: 'FAILED',
            errorReason,
            completedAt: new Date(),
        },
    }).catch(() => {});

    emitToWorkspace(workspaceId, 'lead_list.failed', {
        leadListId,
        errorReason,
    });

    // Log error event
    await logEvent(workspaceId, 'system_error', 'lead-generation-worker', {
        errorReason,
        leadListId
    });

    log.warn({ leadListId, errorReason }, 'LeadList marked FAILED');
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
