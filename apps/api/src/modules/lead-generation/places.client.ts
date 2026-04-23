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
    lat?: number;
    lng?: number;
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
        'id,displayName,nationalPhoneNumber,internationalPhoneNumber,formattedAddress,websiteUri,location',
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
        lat: data.location?.latitude,
        lng: data.location?.longitude,
        raw: data,
    };
}

// ── Grid Search ───────────────────────────────────────────────────────────────

/**
 * Geocode a city name to get its center lat/lng using a Places text search.
 * Returns null if the city cannot be found.
 */
async function geocodeCity(
    cityName: string,
    apiKey: string,
): Promise<{ lat: number; lng: number } | null> {
    try {
        const res = await fetch(`${PLACES_BASE}/places:searchText`, buildFetchOptions(
            apiKey,
            'places.id,places.location,places.displayName',
            { textQuery: cityName, maxResultCount: 1, languageCode: 'en' },
        ));
        const data = await assertOk(res, `geocodeCity("${cityName}")`);
        const place = (data.places || [])[0];
        if (!place?.location) return null;
        return { lat: place.location.latitude, lng: place.location.longitude };
    } catch {
        return null;
    }
}

/**
 * Generate a grid of lat/lng centroids covering a circular area.
 *
 * @param centerLat  - City center latitude
 * @param centerLng  - City center longitude
 * @param radiusKm   - Total search radius in km (city size)
 * @param cellKm     - Size of each grid cell in km (e.g. 0.8)
 * @returns Array of { lat, lng } points (centroids of each cell)
 */
function generateGrid(
    centerLat: number,
    centerLng: number,
    radiusKm: number,
    cellKm: number,
): { lat: number; lng: number }[] {
    const LAT_PER_KM  = 1 / 110.574;
    const LNG_PER_KM  = 1 / (111.320 * Math.cos((centerLat * Math.PI) / 180));

    const latStep = cellKm * LAT_PER_KM;
    const lngStep = cellKm * LNG_PER_KM;
    const steps   = Math.ceil(radiusKm / cellKm);

    const points: { lat: number; lng: number }[] = [];

    for (let row = -steps; row <= steps; row++) {
        for (let col = -steps; col <= steps; col++) {
            const lat = centerLat + row * latStep;
            const lng = centerLng + col * lngStep;

            // Only include cells whose centre falls within the city radius
            const dLat = (lat - centerLat) / LAT_PER_KM;
            const dLng = (lng - centerLng) / LNG_PER_KM;
            if (Math.sqrt(dLat * dLat + dLng * dLng) <= radiusKm) {
                points.push({ lat, lng });
            }
        }
    }

    return points;
}

/**
 * Run a Nearby Search for a single grid cell.
 * Returns up to 60 place summaries (3 pages × 20).
 */
async function nearbySearchCell(
    keyword: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    apiKey: string,
): Promise<PlaceSummary[]> {
    const PAGE_SIZE = 20;
    const collected: PlaceSummary[] = [];
    let pageToken: string | undefined;

    do {
        const body: Record<string, unknown> = {
            textQuery: keyword,
            maxResultCount: PAGE_SIZE,
            languageCode: 'en',
            locationBias: {
                circle: {
                    center: { latitude: lat, longitude: lng },
                    radius: radiusMeters,
                },
            },
        };
        if (pageToken) body.pageToken = pageToken;

        try {
            const res = await fetch(`${PLACES_BASE}/places:searchText`, buildFetchOptions(
                apiKey,
                'places.id,places.displayName,nextPageToken',
                body,
            ));
            const data = await assertOk(res, `nearbySearchCell(${lat},${lng})`);
            const places: any[] = data.places || [];

            for (const p of places) {
                collected.push({ placeId: p.id, displayName: resolveDisplayName(p) });
            }

            pageToken = data.nextPageToken;
            if (pageToken) await new Promise(r => setTimeout(r, 500));
        } catch (err: any) {
            log.warn({ err: err.message, lat, lng }, 'Grid cell search failed — skipping cell');
            break;
        }
    } while (pageToken && collected.length < 60);

    return collected;
}

/**
 * Grid Search — bypasses the 60-result/query cap by dividing the city into
 * a grid of small circles (800m radius each), running a Nearby Search on
 * each cell, and deduplicating the results by place_id.
 *
 * Cost note: Each cell uses up to 3 API pages. A typical city grid of 20-30
 * cells = 60-90 text search requests. Budget accordingly.
 *
 * @param keyword    - What to search for (e.g. "grocery store")
 * @param cityName   - City name for geocoding centre (e.g. "Madurai")
 * @param cityLat    - Optional pre-geocoded centre lat (skips geocoding call)
 * @param cityLng    - Optional pre-geocoded centre lng
 * @param apiKey     - Google Places API key
 * @param maxCells   - Hard cap on number of grid cells (default 25, cost control)
 */
export async function gridSearchPlaces(
    keyword: string,
    cityName: string,
    apiKey: string,
    options?: {
        cityLat?: number;
        cityLng?: number;
        cityRadiusKm?: number;
        cellSizeKm?: number;
        maxCells?: number;
    },
): Promise<PlaceSummary[]> {
    const {
        cityRadiusKm = 5,   // typical city search radius
        cellSizeKm   = 0.8, // 800m cells → up to 60 results each, minimal overlap
        maxCells     = 25,  // hard cap: 25 cells × 3 pages = 75 API calls max
    } = options || {};

    // 1. Geocode if not provided
    let centerLat = options?.cityLat;
    let centerLng = options?.cityLng;

    if (centerLat === undefined || centerLng === undefined) {
        const geo = await geocodeCity(cityName, apiKey);
        if (!geo) {
            log.warn({ cityName }, 'Could not geocode city — falling back to text search');
            return searchPlaces(keyword, 60, apiKey);
        }
        centerLat = geo.lat;
        centerLng = geo.lng;
    }

    // 2. Generate grid
    let cells = generateGrid(centerLat, centerLng, cityRadiusKm, cellSizeKm);
    if (cells.length > maxCells) {
        // Take a representative subset spread across the grid
        const step = Math.ceil(cells.length / maxCells);
        cells = cells.filter((_, i) => i % step === 0).slice(0, maxCells);
    }

    log.info({ keyword, cityName, cells: cells.length, cityRadiusKm, cellSizeKm }, 'Starting grid search');

    // 3. Search each cell, collect and deduplicate by place_id
    const seen = new Set<string>();
    const results: PlaceSummary[] = [];

    for (const cell of cells) {
        const cellResults = await nearbySearchCell(
            keyword,
            cell.lat,
            cell.lng,
            Math.round(cellSizeKm * 1000 * 1.2), // radius = cell size + 20% overlap buffer
            apiKey,
        );

        for (const place of cellResults) {
            if (!seen.has(place.placeId)) {
                seen.add(place.placeId);
                results.push(place);
            }
        }

        // Small pause between cells to avoid rate limits
        await new Promise(r => setTimeout(r, 200));
    }

    log.info({ keyword, cityName, totalUnique: results.length, cells: cells.length }, 'Grid search complete');

    return results;
}

