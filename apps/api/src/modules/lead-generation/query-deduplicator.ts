import { getRedisClient } from '../../core/redis';
import { prisma } from '../../prisma/client';
import { normalizeToE164 } from './phone.utils';
import { createLogger } from '../../core/logger';

const log = createLogger({ module: 'query-deduplicator' });

export interface CandidateLead {
    googlePlaceId?: string | null;
    phone?: string | null;
    lat?: number | null;
    lng?: number | null;
    name: string;
}

/**
 * Normalizes a name for fuzzy matching by lowercasing and removing punctuation.
 */
function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

/**
 * Computes Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Returns true if the two names are considered a match (>85% similarity).
 */
function isNameFuzzyMatch(nameA: string, nameB: string): boolean {
    const a = normalizeName(nameA);
    const b = normalizeName(nameB);
    const distance = levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return true;
    const similarity = (maxLength - distance) / maxLength;
    return similarity > 0.85;
}

export const QueryDeduplicator = {
    /**
     * Warms up the Redis sets from the DB for a given workspace.
     * Call this before processing a batch of queries.
     */
    async warmUpCache(workspaceId: string): Promise<void> {
        const redis = getRedisClient();
        const placeIdKey = `lead_dedup:placeId:${workspaceId}`;
        const phoneKey = `lead_dedup:phone:${workspaceId}`;

        // Check if cache is already warm (keys exist)
        const exists = await redis.exists(placeIdKey);
        if (exists) return; // Assume it's warm if the placeId key exists

        log.info({ workspaceId }, 'Warming up lead dedup cache from DB');

        // Fetch all distinct placeIds and phones from DB
        const leads = await prisma.lead.findMany({
            where: { workspaceId },
            select: { googlePlaceId: true, phone: true },
        });

        const placeIds = leads.map(l => l.googlePlaceId).filter(Boolean) as string[];
        const phones = leads.map(l => l.phone).filter(Boolean) as string[];

        const pipeline = redis.pipeline();
        
        if (placeIds.length > 0) {
            pipeline.sadd(placeIdKey, ...placeIds);
        } else {
            // Add a dummy value so the key exists and we know it's "warm but empty"
            pipeline.sadd(placeIdKey, '__empty__');
        }
        
        if (phones.length > 0) {
            pipeline.sadd(phoneKey, ...phones);
        } else {
            pipeline.sadd(phoneKey, '__empty__');
        }

        // Set 24h TTL
        pipeline.expire(placeIdKey, 24 * 60 * 60);
        pipeline.expire(phoneKey, 24 * 60 * 60);

        await pipeline.exec();
    },

    /**
     * Checks if a candidate lead is a duplicate.
     * Runs through L1 (Redis placeId) -> L2 (Redis phone) -> L3 (PostGIS geo + fuzzy name) -> L4 (Name fallback)
     */
    async isDuplicate(workspaceId: string, candidate: CandidateLead): Promise<boolean> {
        const redis = getRedisClient();
        const placeIdKey = `lead_dedup:placeId:${workspaceId}`;
        const phoneKey = `lead_dedup:phone:${workspaceId}`;

        // L1: Redis PlaceID check
        if (candidate.googlePlaceId) {
            const isPlaceIdDup = await redis.sismember(placeIdKey, candidate.googlePlaceId);
            if (isPlaceIdDup) return true;
        }

        // L2: Redis Phone check
        const normalizedPhone = normalizeToE164(candidate.phone);
        if (normalizedPhone) {
            const isPhoneDup = await redis.sismember(phoneKey, normalizedPhone);
            if (isPhoneDup) return true;
        }

        // L3: PostGIS Geo check (Haversine < 50m)
        if (candidate.lat && candidate.lng) {
            // Find all leads within 50 meters
            // Note: Since ST_DWithin uses geography by default when cast, 50 means 50 meters.
            const geoMatches = await prisma.$queryRaw`
                SELECT name FROM leads
                WHERE workspace_id = ${workspaceId}
                AND ST_DWithin(
                    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
                    ST_SetSRID(ST_MakePoint(${candidate.lng}, ${candidate.lat}), 4326)::geography,
                    50
                )
            ` as { name: string }[];

            if (geoMatches.length > 0) {
                // We found businesses very close physically. Check if the name matches fuzzily.
                for (const match of geoMatches) {
                    if (isNameFuzzyMatch(match.name, candidate.name)) {
                        return true;
                    }
                }
            }
        } else {
            // L4: Name Fallback (if no lat/lng available, check exactly matching normalized names)
            // Just search for exact name match in DB since we can't fuzzy search all records efficiently.
            // A more robust system would use Postgres full text search or trgm extension, 
            // but for now an exact match on DB level is the safest fallback if geo is missing.
            const nameMatch = await prisma.lead.findFirst({
                where: {
                    workspaceId,
                    name: candidate.name,
                },
                select: { id: true }
            });
            if (nameMatch) return true;
        }

        return false;
    },

    /**
     * Marks a lead as seen by adding its identifiers to the Redis sets.
     * (Call this *after* inserting into the database)
     */
    async markAsSeen(workspaceId: string, candidate: CandidateLead): Promise<void> {
        const redis = getRedisClient();
        const pipeline = redis.pipeline();
        
        const placeIdKey = `lead_dedup:placeId:${workspaceId}`;
        if (candidate.googlePlaceId) {
            pipeline.sadd(placeIdKey, candidate.googlePlaceId);
            pipeline.expire(placeIdKey, 24 * 60 * 60); // Roll TTL
        }
        
        const phoneKey = `lead_dedup:phone:${workspaceId}`;
        const normalizedPhone = normalizeToE164(candidate.phone);
        if (normalizedPhone) {
            pipeline.sadd(phoneKey, normalizedPhone);
            pipeline.expire(phoneKey, 24 * 60 * 60); // Roll TTL
        }

        if (pipeline.length > 0) {
            await pipeline.exec();
        }
    }
};
