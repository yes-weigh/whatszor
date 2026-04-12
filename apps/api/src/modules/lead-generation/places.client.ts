/**
 * places.client.ts — Google Places API (New) abstraction
 *
 * Wraps all HTTP calls to the Places API v1 endpoints.
 * Uses field masking to keep costs at the Basic Data tier.
 *
 * API reference: https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * Key decisions:
 *  - Text Search: fetches only place IDs + displayName (lowest cost)
 *  - Place Details: fetches phone, address, website (all Basic Data fields)
 *  - All errors are surfaced so the caller (worker) can react
 */

import { createLogger } from '../../core/logger';

const log = createLogger({ module: 'places-client' });

const PLACES_BASE = 'https://places.googleapis.com/v1';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface PlaceSummary {
    placeId: string;
    displayName: string;
    address?: string;
}

export interface PlaceDetail {
    placeId: string;
    name: string;
    /** Raw phone string from Google — caller is responsible for normalizing */
    phone?: string;
    address?: string;
    website?: string;
    /** Complete raw response for storage in rawData column */
    raw: Record<string, unknown>;
}

export interface SearchPreview {
    /** Total number of results available from the API */
    estimatedCount: number;
    /** Up to 5 sample results (displayName + address only) */
    sample: PlaceSummary[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveDisplayName(place: any): string {
    return place?.displayName?.text || place?.displayName || 'Unknown';
}

/** Build the common fetch options for all Places API calls. */
function buildFetchOptions(apiKey: string, fieldMask: string, body?: unknown): RequestInit {
    return {
        method: body ? 'POST' : 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': fieldMask,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000), // 15s timeout per call
    };
}

/** Parse and throw on non-2xx Google API responses. */
async function assertOk(res: Response, context: string): Promise<any> {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = (body as any)?.error?.message || `HTTP ${res.status}`;
        const err = new Error(`[PlacesAPI] ${context}: ${msg}`);
        (err as any).status = res.status;
        (err as any).apiError = body;
        throw err;
    }
    return body;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Lightweight search — returns up to 5 samples + estimated count.
 * Used by the /preview endpoint. No detail calls are made.
 */
export async function previewPlaces(
    query: string,
    apiKey: string,
): Promise<SearchPreview> {
    const res = await fetch(`${PLACES_BASE}/places:searchText`, buildFetchOptions(
        apiKey,
        'places.id,places.displayName,places.formattedAddress',
        { textQuery: query, maxResultCount: 5, languageCode: 'en' },
    ));

    const data = await assertOk(res, `previewPlaces("${query}")`);
    const places: any[] = data.places || [];

    const sample: PlaceSummary[] = places.map((p: any) => ({
        placeId: p.id,
        displayName: resolveDisplayName(p),
        address: p.formattedAddress,
    }));

    log.debug({ query, count: sample.length }, 'Places preview fetched');

    return {
        estimatedCount: sample.length, // API doesn't return totalSize on text search — use count
        sample,
    };
}

/**
 * Full text search — returns up to maxResults place summaries (IDs + names).
 * Paginates via nextPageToken to fetch beyond the 20-result-per-page limit.
 * Used by the worker for the first stage of the processing pipeline.
 */
export async function searchPlaces(
    query: string,
    maxResults: number,
    apiKey: string,
): Promise<PlaceSummary[]> {
    const PAGE_SIZE = 20; // Google Places API max per request
    const collected: PlaceSummary[] = [];
    let pageToken: string | undefined;

    do {
        const body: Record<string, unknown> = {
            textQuery: query,
            maxResultCount: PAGE_SIZE,
            languageCode: 'en',
        };
        if (pageToken) body.pageToken = pageToken;

        const res = await fetch(`${PLACES_BASE}/places:searchText`, buildFetchOptions(
            apiKey,
            'places.id,places.displayName,nextPageToken',
            body,
        ));

        const data = await assertOk(res, `searchPlaces("${query}")`);
        const places: any[] = data.places || [];

        for (const p of places) {
            if (collected.length >= maxResults) break;
            collected.push({
                placeId: p.id,
                displayName: resolveDisplayName(p),
            });
        }

        // nextPageToken is absent on last page or when results are exhausted
        pageToken = data.nextPageToken;

        // Brief pause required by Google between paginated requests
        if (pageToken && collected.length < maxResults) {
            await new Promise(r => setTimeout(r, 500));
        }

    } while (pageToken && collected.length < maxResults);

    log.debug({ query, returned: collected.length, maxResults }, 'Places text search complete (paginated)');

    return collected;
}

/**
 * Fetch details for a single place.
 * Uses Basic Data field mask — cheapest tier ($0.017/request).
 * Returns null if the place cannot be found (404).
 */
export async function getPlaceDetail(
    placeId: string,
    apiKey: string,
): Promise<PlaceDetail | null> {
    const url = `${PLACES_BASE}/places/${encodeURIComponent(placeId)}`;
    const res = await fetch(url, buildFetchOptions(
        apiKey,
        'id,displayName,nationalPhoneNumber,internationalPhoneNumber,formattedAddress,websiteUri',
    ));

    if (res.status === 404) {
        log.warn({ placeId }, 'Place not found (404) — skipping');
        return null;
    }

    const data = await assertOk(res, `getPlaceDetail(${placeId})`);

    // Prefer internationalPhoneNumber (already close to E.164), fall back to national
    const rawPhone: string | undefined =
        data.internationalPhoneNumber || data.nationalPhoneNumber || undefined;

    return {
        placeId: data.id || placeId,
        name: resolveDisplayName(data),
        phone: rawPhone,
        address: data.formattedAddress,
        website: data.websiteUri,
        raw: data,
    };
}
