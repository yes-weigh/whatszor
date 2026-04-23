import { getRedisClient } from '../../core/redis';
import { searchPlaces, PlaceSummary } from './places.client';
import { createLogger } from '../../core/logger';
import * as crypto from 'crypto';

const log = createLogger({ module: 'query-cache' });

export const QueryCacheService = {
    /**
     * Cache wrapper around searchPlaces.
     * Caches placeIds for 7 days based on keyword + rounded lat/lng.
     */
    async searchPlacesCached(
        query: string,
        keyword: string,
        lat: number | null,
        lng: number | null,
        maxResults: number,
        apiKey: string
    ): Promise<PlaceSummary[]> {
        if (lat === null || lng === null) {
            log.debug({ query }, 'Bypassing cache due to missing lat/lng');
            return searchPlaces(query, maxResults, apiKey);
        }

        const redis = getRedisClient();
        
        // Hash parameters with 4-decimal precision (~11m resolution)
        const latRounded = Number(lat).toFixed(4);
        const lngRounded = Number(lng).toFixed(4);
        const hashInput = `${keyword.toLowerCase()}:${latRounded}:${lngRounded}`;
        const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
        const cacheKey = `lead_gen:search_cache:${hash}`;

        const cached = await redis.get(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached) as PlaceSummary[];
                log.info({ query, hashInput }, 'Search results retrieved from cache');
                return parsed.slice(0, maxResults);
            } catch(e) {
                log.warn({ err: e, cacheKey }, 'Failed to parse cached search results');
            }
        }

        // Cache miss -> API call
        const results = await searchPlaces(query, maxResults, apiKey);
        
        // Cache only placeId and displayName for 7 days
        const toCache = results.map(r => ({ placeId: r.placeId, displayName: r.displayName }));
        await redis.set(cacheKey, JSON.stringify(toCache), 'EX', 7 * 24 * 60 * 60);

        return results;
    }
};
