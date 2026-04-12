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
import { searchPlaces, getPlaceDetail } from './places.client';
import { normalizeToE164 } from './phone.utils';
import { requirePlacesApiKey } from './lead-generation.service';

const log = createLogger({ module: 'lead-generation-worker' });

export interface LeadGenerationJobData {
    workspaceId: string;
    leadListId: string;
    query: string;
    maxResults: number;
    traceId?: string;
}

const MAX_DETAILS_PER_JOB = 100; // Hard cap — controls API cost per job (100 when fetchMaximum is enabled)

export async function processLeadGenerationJob(job: Job<LeadGenerationJobData>): Promise<void> {
    const { workspaceId, leadListId, query, maxResults } = job.data;

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

    // ── 2. Text Search ───────────────────────────────────────────────────────
    let summaries;
    try {
        summaries = await searchPlaces(query, Math.min(maxResults, MAX_DETAILS_PER_JOB), apiKey);
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
        return;
    }

    // ── 4. Update totalFound ─────────────────────────────────────────────────
    await prisma.leadList.update({
        where: { id: leadListId },
        data: { totalFound: summaries.length },
    });

    log.info({ leadListId, totalFound: summaries.length }, 'Places search complete');

    // ── 5. Fetch details + store leads ───────────────────────────────────────
    let withPhone = 0;

    for (const summary of summaries) {
        let detail = null;

        try {
            detail = await getPlaceDetail(summary.placeId, apiKey);
        } catch (err: any) {
            log.warn({ placeId: summary.placeId, err: err.message }, 'Failed to fetch place detail — storing with displayName only');
            // Fall through: store a lead with whatever we have from the summary
        }

        // Normalize phone number
        const rawPhone = detail?.phone ?? null;
        const phone = normalizeToE164(rawPhone);
        const hasPhone = phone !== null;

        if (hasPhone) withPhone++;

        // Store the lead — skip on @@unique([leadListId, googlePlaceId]) conflict
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
                    googlePlaceId: summary.placeId,
                    rawData: rawDataJson,
                    status: 'RAW',
                },
            });
        } catch (err: any) {
            if (err?.code === 'P2002') {
                // Duplicate placeId in this list — already stored, skip silently
                log.debug({ placeId: summary.placeId, leadListId }, 'Duplicate place skipped');
            } else {
                log.error({ err, placeId: summary.placeId }, 'Failed to create Lead record');
            }
        }

        // Throttle: small delay between detail calls to avoid hitting rate limits
        // BullMQ handles the retry backoff for transient API errors
        await delay(150);
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

    log.info({ leadListId, withPhone, totalFound: summaries.length }, 'LeadList marked READY');

    // ── 7. SSE push ──────────────────────────────────────────────────────────
    const list = await prisma.leadList.findUnique({
        where: { id: leadListId },
        select: { name: true, query: true },
    });

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
        withPhone
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
