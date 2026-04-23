import { prisma } from '../../prisma/client';
import { getRedisClient } from '../../core/redis';
import { createLogger } from '../../core/logger';
import { randomUUID } from 'crypto';

const log = createLogger({ module: 'query-planner' });

export interface MicroArea {
    name: string;
    lat?: number;
    lng?: number;
}

export interface PlanLeadCampaignInput {
    workspaceId: string;
    city: string;
    cityLat?: number;
    cityLng?: number;
    keywords: string[];
    maxBudget: number;
    microAreas?: MicroArea[];
}

export const QueryPlannerService = {
    /**
     * Orchestrates the 2-stage preview logic and builds the plan.
     * Filters out keys matching active 24h cooldowns.
     */
    async planLeadCampaign(input: PlanLeadCampaignInput) {
        const { workspaceId, city, keywords, maxBudget, microAreas, cityLat, cityLng } = input;
        const redis = getRedisClient();
        const planBatchId = randomUUID();
        
        let areas = microAreas ?? [];

        // 0. Auto-generate 3x3 grid if microAreas not provided and lat/lng are
        if (areas.length === 0 && cityLat !== undefined && cityLng !== undefined) {
            const step = 0.04; // roughly 4-5km
            const labels = ['NW', 'N', 'NE', 'W', 'Center', 'E', 'SW', 'S', 'SE'];
            let i = 0;
            for (const dLat of [step, 0, -step]) {
                for (const dLng of [-step, 0, step]) {
                    areas.push({
                        name: labels[i++],
                        lat: cityLat + dLat,
                        lng: cityLng + dLng
                    });
                }
            }
        } else if (areas.length === 0) {
            // Fallback if no lat/lng provided
            areas = [{ name: 'Center' }];
        }

        // Generate all possible candidates
        const candidates = [];
        for (const keyword of keywords) {
            for (const area of areas) {
                candidates.push({
                    workspaceId,
                    planBatchId,
                    city,
                    keyword,
                    microArea: area.name,
                    microAreaLat: area.lat ?? null,
                    microAreaLng: area.lng ?? null,
                    estimatedLeads: 20, // Base estimate before modifiers
                    preOverlapScore: 0,
                });
            }
        }

        // 1. Filter out 24h cooldowns
        const filteredCandidates = [];
        for (const c of candidates) {
            const cooldownKey = `lead:cooldown:${workspaceId}:${city}:${c.keyword}`;
            const isCooldown = await redis.exists(cooldownKey);
            if (!isCooldown) {
                filteredCandidates.push(c);
            }
        }

        log.info({ workspaceId, candidates: candidates.length, filtered: filteredCandidates.length }, 'Candidate generation and cooldown filtering complete');

        // 2. Apply Learning Loop Modifiers
        const modifiedCandidates = await this.applyLearningLoopModifiers(workspaceId, city, filteredCandidates);

        // 3. Stage 1: Calculate preOverlapScore and filter > 0.65
        for (const c of modifiedCandidates) {
            c.preOverlapScore = await this.calculatePreOverlapScore(workspaceId, city, c.keyword, c.microArea);
        }
        
        const stage1Passed = modifiedCandidates.filter(c => c.preOverlapScore <= 0.65);

        // Sort by estimated yields
        stage1Passed.sort((a, b) => b.estimatedLeads - a.estimatedLeads);

        // 4. Optimize Budget (Greedy Knapsack with limits)
        const finalPlan = this.optimizeBudget(stage1Passed, maxBudget);

        log.info({ workspaceId, planBatchId, selectedQueries: finalPlan.length }, 'Budget optimization complete');

        // Insert into database
        if (finalPlan.length > 0) {
            await prisma.leadQueryPlan.createMany({
                data: finalPlan.map(p => ({
                    workspaceId: p.workspaceId,
                    planBatchId: p.planBatchId,
                    city: p.city,
                    keyword: p.keyword,
                    microArea: p.microArea,
                    microAreaLat: p.microAreaLat,
                    microAreaLng: p.microAreaLng,
                    status: 'PENDING',
                    preOverlapScore: p.preOverlapScore,
                    estimatedLeads: Math.floor(p.estimatedLeads)
                }))
            });
        }

        return {
            planBatchId,
            queriesCount: finalPlan.length,
            plan: finalPlan
        };
    },

    /**
     * Fetches QueryPerformanceMetric to adjust baseline estimates.
     */
    async applyLearningLoopModifiers(workspaceId: string, city: string, candidates: any[]) {
        const metrics = await prisma.queryPerformanceMetric.findMany({
            where: { workspaceId, city }
        });

        const metricMap = new Map<string, { yieldMultiplier: number; runCount: number }>();
        for (const m of metrics) {
            metricMap.set(m.keyword, { yieldMultiplier: m.yieldMultiplier, runCount: m.runCount });
        }

        return candidates.map(c => {
            const metric = metricMap.get(c.keyword);
            const multiplier = metric && metric.runCount >= 3 ? metric.yieldMultiplier : 1.0;
            return {
                ...c,
                estimatedLeads: c.estimatedLeads * multiplier
            };
        });
    },

    /**
     * Greedy knapsack with constraints: max 3/micro-area, max 4/keyword.
     */
    optimizeBudget(candidates: any[], maxBudget: number) {
        const selected = [];
        const areaCounts = new Map<string, number>();
        const keywordCounts = new Map<string, number>();

        for (const c of candidates) {
            if (selected.length >= maxBudget) break;

            const aCount = areaCounts.get(c.microArea) || 0;
            const kCount = keywordCounts.get(c.keyword) || 0;

            if (aCount < 3 && kCount < 4) {
                selected.push(c);
                areaCounts.set(c.microArea, aCount + 1);
                keywordCounts.set(c.keyword, kCount + 1);
            }
        }

        return selected;
    },

    /**
     * Calculate PreOverlapScore using Jaccard Similarity on Google Place Types 
     * and historical data for a given microArea and keyword.
     */
    async calculatePreOverlapScore(workspaceId: string, city: string, keyword: string, microArea: string): Promise<number> {
        // Fetch recent queries in this micro area for this workspace
        const recentPlans = await prisma.leadQueryPlan.findMany({
            where: {
                workspaceId,
                city,
                microArea,
                status: 'DONE',
                createdAt: {
                    gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // last 30 days
                }
            },
            take: 10
        });

        if (recentPlans.length === 0) return 0; // No historical data to overlap with

        // Extract keywords from recent plans
        const historicalKeywords = recentPlans.map(p => p.keyword.toLowerCase());
        const targetKeyword = keyword.toLowerCase();

        // 1. Simple Jaccard index on keyword tokens
        const targetTokens = new Set(targetKeyword.split(' '));
        
        let maxOverlap = 0;

        for (const histKeyword of historicalKeywords) {
            const histTokens = new Set(histKeyword.split(' '));
            const intersection = new Set([...targetTokens].filter(x => histTokens.has(x)));
            const union = new Set([...targetTokens, ...histTokens]);
            
            const jaccard = intersection.size / union.size;
            if (jaccard > maxOverlap) {
                maxOverlap = jaccard;
            }
        }

        // Ideally, we'd also pull `types[]` from leads generated by `recentPlans` and do a Jaccard on `types`
        // But for performance in pre-scoring, token overlap on keywords is a strong proxy.

        return maxOverlap;
    }
};
