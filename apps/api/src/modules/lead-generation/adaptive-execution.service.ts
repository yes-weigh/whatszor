import { prisma } from '../../prisma/client';
import { createLeadList } from './lead-generation.service';
import { createLogger } from '../../core/logger';

const log = createLogger({ module: 'adaptive-execution' });

export const AdaptiveExecutionService = {
    /**
     * Entry point to execute a batch of query plans.
     * Starts the execution asynchronously and returns immediately.
     */
    async executeCampaignBatch(workspaceId: string, planBatchId: string, targetAudienceId?: string) {
        // Run asynchronously
        this._runBatch(workspaceId, planBatchId, targetAudienceId).catch(err => {
            log.error({ err, planBatchId }, 'Campaign batch execution failed');
        });
    },

    async _runBatch(workspaceId: string, planBatchId: string, targetAudienceId?: string) {
        // Fetch pending plans ordered by estimated leads (descending)
        const plans = await prisma.leadQueryPlan.findMany({
            where: { planBatchId, workspaceId, status: 'PENDING' },
            orderBy: { estimatedLeads: 'desc' }
        });

        if (plans.length === 0) return;

        log.info({ planBatchId, totalPlans: plans.length }, 'Starting adaptive execution for batch');

        const BATCH_SIZE = 3;
        for (let i = 0; i < plans.length; i += BATCH_SIZE) {
            const currentBatch = plans.slice(i, i + BATCH_SIZE);
            
            // Mark RUNNING
            await prisma.leadQueryPlan.updateMany({
                where: { id: { in: currentBatch.map(p => p.id) } },
                data: { status: 'RUNNING' }
            });

            // Enqueue all in current batch
            for (const plan of currentBatch) {
                const query = `${plan.keyword} in ${plan.city}`;
                await createLeadList(workspaceId, {
                    query,
                    name: `[Campaign] ${query}`,
                    fetchMaximum: true,
                    targetAudienceId,
                    keyword: plan.keyword,
                    lat: plan.microAreaLat ?? undefined,
                    lng: plan.microAreaLng ?? undefined,
                    planId: plan.id
                }).catch(e => {
                    log.error({ err: e, planId: plan.id }, 'Failed to enqueue plan');
                    prisma.leadQueryPlan.update({
                        where: { id: plan.id },
                        data: { status: 'FAILED' }
                    }).catch(() => {});
                });
            }

            // Wait for current batch to complete
            let isComplete = false;
            while (!isComplete) {
                // Poll every 5 seconds
                await new Promise(res => setTimeout(res, 5000));
                
                const statuses = await prisma.leadQueryPlan.findMany({
                    where: { id: { in: currentBatch.map(p => p.id) } },
                    select: { status: true }
                });

                const allDone = statuses.every(s => 
                    s.status === 'DONE' || s.status === 'KILLED' || s.status === 'FAILED'
                );

                if (allDone) {
                    isComplete = true;
                }
            }

            // Compute avg duplicate rate for this mini-batch
            const completedPlans = await prisma.leadQueryPlan.findMany({
                where: { id: { in: currentBatch.map(p => p.id) } }
            });

            let totalLeads = 0;
            let totalDupes = 0;
            for (const p of completedPlans) {
                totalLeads += (p.actualLeads || 0);
                totalDupes += (p.actualDupes || 0);
            }

            const totalSeen = totalLeads + totalDupes;
            if (totalSeen >= 10) { // Only evaluate if we have enough data to be statistically relevant
                const avgDupRate = totalDupes / totalSeen;
                log.info({ planBatchId, avgDupRate }, 'Mini-batch completed');

                // If duplicate rate > 80%, kill remaining batch
                if (avgDupRate > 0.80) {
                    log.warn({ planBatchId, avgDupRate }, 'High duplicate rate detected. Stopping remaining queries.');
                    
                    const remainingPlans = plans.slice(i + BATCH_SIZE);
                    if (remainingPlans.length > 0) {
                        await prisma.leadQueryPlan.updateMany({
                            where: { id: { in: remainingPlans.map(p => p.id) } },
                            data: { status: 'SKIPPED' }
                        });
                    }
                    break;
                }
            }
        }

        log.info({ planBatchId }, 'Adaptive execution for batch completed');
    }
};
