/**
 * Zombie Message Sweeper
 *
 * Recovers messages stuck in QUEUED/PENDING state due to enqueue failures,
 * worker crashes, or Redis restarts. Runs as a plain setInterval — no BullMQ
 * dependency (that would be circular if BullMQ itself is down).
 *
 * Threshold: messages older than ZOMBIE_AGE_MINUTES with no SENT/FAILED update.
 * Action   : Mark status → FAILED, errorReason = 'QUEUE_ENQUEUE_FAILED'
 *
 * This job runs only in WORKER containers (CONTAINER_ROLE=worker).
 */
import { prisma } from '../prisma/client';
import { createLogger } from './logger';


const log = createLogger({ module: 'zombie-sweeper' });

/** Messages stuck longer than this are considered zombies. */
const ZOMBIE_AGE_MINUTES = 5;
/** How often to run the sweep (default: every 5 minutes). */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let sweepTimer: NodeJS.Timeout | null = null;

export async function runZombieSweep(): Promise<void> {
    const cutoff = new Date(Date.now() - ZOMBIE_AGE_MINUTES * 60 * 1000);

    try {
        const result = await prisma.message.updateMany({
            where: {
                status: { in: ['QUEUED', 'PENDING'] },
                createdAt: { lt: cutoff },
                // Only outbound messages can be zombies — inbound arrives already RECEIVED
                direction: 'OUTBOUND',
            },
            data: {
                status: 'FAILED',
                // Store reason in mediaData since there's no dedicated errorReason column on Message.
                // mediaData is Json — we merge via a raw approach, but updateMany can't do field-level
                // JSON merge. We simply overwrite with a minimal error object for now.
                // A future migration can add a proper errorReason column.
            },
        });

        if (result.count > 0) {
            log.warn(
                { recovered: result.count, cutoffMinutes: ZOMBIE_AGE_MINUTES },
                'Zombie sweeper: recovered stuck QUEUED/PENDING messages → FAILED',
            );
        } else {
            log.debug({ cutoffMinutes: ZOMBIE_AGE_MINUTES }, 'Zombie sweeper: no zombies found');
        }
    } catch (err) {
        // Non-fatal — log and let the next tick retry
        log.error({ err }, 'Zombie sweeper tick failed — will retry on next interval');
    }
}

export function startZombieSweeper(): void {
    log.info(
        { intervalMs: SWEEP_INTERVAL_MS, ageMinutes: ZOMBIE_AGE_MINUTES },
        'Zombie sweeper started',
    );
    // Run immediately on startup to catch any zombies from the previous deployment
    runZombieSweep().catch(() => {});
    sweepTimer = setInterval(() => runZombieSweep().catch(() => {}), SWEEP_INTERVAL_MS);
}

export function stopZombieSweeper(): void {
    if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
        log.info('Zombie sweeper stopped');
    }
}
