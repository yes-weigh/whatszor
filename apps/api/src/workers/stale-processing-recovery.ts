import { prisma } from '../prisma/client';
import { createLogger } from '../core/logger';

const log = createLogger({ module: 'stale-processing-recovery' });

export async function sweepStaleCampaignMembers() {
    log.info('Running stale CampaignMember recovery sweep');
    try {
        // Find CampaignMember rows where status = 'PROCESSING' and updatedAt < NOW() - 10 minutes
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        // We use a transaction and process in batches to avoid locking the entire table
        const recoveredCount = await prisma.$transaction(async (tx) => {
            let totalRecovered = 0;
            const BATCH_SIZE = 100;

            while (true) {
                // Fetch a batch of stale members
                const staleMembers = await tx.campaignMember.findMany({
                    where: {
                        status: 'PROCESSING',
                        updatedAt: {
                            lt: tenMinutesAgo,
                        },
                    },
                    take: BATCH_SIZE,
                    select: { id: true },
                });

                if (staleMembers.length === 0) {
                    break;
                }

                const staleIds = staleMembers.map((m) => m.id);

                // Update the batch
                const result = await tx.campaignMember.updateMany({
                    where: {
                        id: { in: staleIds },
                        status: 'PROCESSING', // Check again just in case
                    },
                    data: {
                        status: 'PENDING',
                        errorReason: 'Recovered from stuck PROCESSING state',
                    },
                });

                totalRecovered += result.count;

                // If we fetched fewer than BATCH_SIZE, we are done
                if (staleMembers.length < BATCH_SIZE) {
                    break;
                }
            }

            return totalRecovered;
        });

        if (recoveredCount > 0) {
            log.info({ recoveredCount }, 'Recovered stuck CampaignMembers back to PENDING');
        } else {
            log.debug('No stale CampaignMembers found');
        }
    } catch (error) {
        log.error({ error }, 'Failed to run stale CampaignMember sweep');
    }
}

let sweeperInterval: NodeJS.Timeout | null = null;

export function startStaleProcessingRecovery() {
    if (sweeperInterval) return;

    // Only run when NODE_ROLE is 'worker' or explicitly requested
    if (process.env.NODE_ROLE === 'worker' || process.env.WORKER_ENABLED === 'true') {
        log.info('Starting stale processing recovery sweeper (runs every 5 minutes)');
        
        // Run immediately
        sweepStaleCampaignMembers();

        // Run every 5 minutes
        sweeperInterval = setInterval(() => {
            sweepStaleCampaignMembers();
        }, 5 * 60 * 1000);
    }
}

export function stopStaleProcessingRecovery() {
    if (sweeperInterval) {
        clearInterval(sweeperInterval);
        sweeperInterval = null;
        log.info('Stopped stale processing recovery sweeper');
    }
}
