import { config } from 'dotenv';
import path from 'path';
process.env.NODE_ENV = 'test';
config({ path: path.join(__dirname, '../../.env.test'), override: true });

import { PrismaClient } from '@prisma/client';
import { getQueue, QueueName } from '../../src/queues';
import { startWorkers } from '../../src/queues/worker';
import { connectRedis, disconnectRedis, getRedisClient } from '../../src/core/redis';
import { waManager } from '../../src/modules/whatsapp/whatsapp.service';

const prisma = new PrismaClient();

const BATCH_SIZE = 50;
const WORKSPACE_ID = 'ws_loadtest_1';
const SESSIONS = ['fairness_1', 'fairness_2', 'fairness_3', 'fairness_4', 'fairness_5'];

async function run() {
    console.log(`[FairnessTest] Connecting Redis...`);
    await connectRedis();
    const redis = getRedisClient();
    await redis.flushdb();
    
    console.log(`[FairnessTest] Injecting mock sessions for fairness 1-5...`);
    for (const sessionId of SESSIONS) {
        await prisma.whatsAppAccount.upsert({
            where: { sessionId },
            create: {
                id: `acc_fairness_${sessionId}`,
                sessionId,
                workspaceId: WORKSPACE_ID,
                name: `Fairness Tester ${sessionId}`,
                status: 'CONNECTED'
            },
            update: { status: 'CONNECTED' }
        });
        waManager.setupMockSession(sessionId);
    }
    
    console.log(`[FairnessTest] Simulating 300 messages across 3 sessions (100 each)...`);
    console.log(`[FairnessTest] Simulating ${BATCH_SIZE} rapid messages across ${SESSIONS.length} sessions...`);

    const queue = getQueue(QueueName.OUTBOUND_MESSAGES);

    for (const sessionId of SESSIONS) {
        const jobs = Array.from({ length: BATCH_SIZE }).map((_, j) => ({
            name: 'sendMessage',
            data: {
                workspaceId: WORKSPACE_ID,
                sessionId,
                toJid: `1234567${sessionId}${j.toString().padStart(4, '0')}@s.whatsapp.net`,
                content: `Fairness ${sessionId}-${j}`,
                type: 'TEXT',
                messageId: `msg_fairness_${sessionId}_${j}_${Date.now()}`
            },
            opts: { removeOnFail: false }
        }));
        await queue.addBulk(jobs);
    }

    console.log(`[FairnessTest] Starting background workers...`);
    startWorkers();
    
    console.log(`[FairnessTest] Enqueued ${SESSIONS.length * BATCH_SIZE} total jobs.`);
    console.log(`[FairnessTest] Monitoring Queue Depth...`);
    
    let isDone = false;
    let cycles = 0;
    while (!isDone) {
        await new Promise(r => setTimeout(r, 2000));
        cycles++;

        const counts = await queue.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed');
        console.log(`[Stats] OUTBOUND | Wait: ${counts.wait} | Active: ${counts.active} | Delayed: ${counts.delayed} | Completed: ${counts.completed}`);

        if (cycles > 7) {
            console.log(`[FairnessTest] Concluding wait.`);
            if (counts.completed >= 40) {
                console.log(`[SUCCESS] Jobs distributed across multiple sessions concurrently without 1 session blocking the others!`);
            } else {
                console.log(`[WARN] Too few jobs completed. Check worker counts or concurrency settings.`);
            }
            isDone = true;
        }
        if (isDone) break;
    }

    console.log(`[FairnessTest] Test Concluded.`);
    await disconnectRedis();
    await prisma.$disconnect();
    process.exit(0);
}

run().catch(console.error);
