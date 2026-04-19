import { prisma } from '../../prisma/client';
import { createLogger } from '../logger';

const log = createLogger({ module: 'expiry-worker' });

/**
 * Sweeps the database for any workspaces whose active subscription
 * deadline has passed. Automatically downgrades their status to EXPIRED
 * to prevent automated background systems (like campaigns/AI routines)
 * from launching on their behalf.
 */
export async function processExpirySweep() {
    log.info('Running daily workspace expiry sweep...');
    try {
        const now = new Date();
        const result = await prisma.workspace.updateMany({
            where: {
                status: { in: ['ACTIVE', 'TRIAL'] },
                expiresAt: { lt: now }
            },
            data: {
                status: 'EXPIRED'
            }
        });

        if (result.count > 0) {
            log.info({ count: result.count }, `Flipped workspaces to EXPIRED state due to elapsed timeline.`);
        } else {
            log.debug('No newly expired workspaces found.');
        }
    } catch (err) {
        log.error({ err }, 'Failed to process workspace expiry sweep');
    }
}
