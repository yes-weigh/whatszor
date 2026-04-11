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

const BATCH_SIZE = 500;
const WORKSPACE_ID = 'ws_loadtest_1';
const MOCK_SESSION_ID = 'test_session_throttle';

async function run() {
    console.log(`[ThrottleTest] Connecting Redis...`);
    await connectRedis();
    const redis = getRedisClient();
    await redis.flushdb();
    
    console.log(`[ThrottleTest] Setting custom limit to 5 msgs/min for ${MOCK_SESSION_ID}...`);
    await redis.set(`ratelimit:custom_limit:${MOCK_SESSION_ID}`, '5');
    
    // Ensure session is seen as connected by the worker
    await prisma.whatsAppAccount.upsert({
        where: { sessionId: MOCK_SESSION_ID },
        create: {
            id: 'acc_throttle_1',
            sessionId: MOCK_SESSION_ID,
            workspaceId: WORKSPACE_ID,
            name: 'Throttle Tester',
            status: 'CONNECTED'
        },
        update: { status: 'CONNECTED' }
    });
    
    console.log(`[ThrottleTest] Injecting mock session...`);
    waManager.setupMockSession(MOCK_SESSION_ID);
    
    console.log(`[ThrottleTest] Simulating 500 outbound messages to single session...`);

    const queue = getQueue(QueueName.OUTBOUND_MESSAGES);

    // Enqueue a burst of 500 jobs manually
    const jobs = Array.from({ length: BATCH_SIZE }).map((_, i) => ({
        name: 'sendMessage',
        data: {
            workspaceId: WORKSPACE_ID,
            sessionId: MOCK_SESSION_ID,
            toJid: `1234567${i.toString().padStart(4, '0')}@s.whatsapp.net`,
            content: `Hello ${i}`,
            type: 'TEXT',
            messageId: `msg_throttle_${i}_${Date.now()}`
        },
        opts: {
            removeOnFail: false
        }
    }));

    console.log(`[ThrottleTest] Starting background workers to process...`);
    startWorkers();

    console.log(`[ThrottleTest] Monitoring Throttling execution...`);
    await queue.addBulk(jobs);
    console.log(`[ThrottleTest] 500 jobs enqueued.`);

    console.log(`[ThrottleTest] Monitoring Queue Depth. Wait for worker to kick in...`);
    let isDone = false;
    let cycles = 0;
    while (!isDone) {
        await new Promise(r => setTimeout(r, 2000));
        cycles++;

        const counts = await queue.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed');
        console.log(`[Stats] OUTBOUND | Wait: ${counts.wait} | Active: ${counts.active} | Delayed: ${counts.delayed} | Completed: ${counts.completed}`);

        // Note: The worker uses the default MAX_MESSAGES_PER_MINUTE.
        // To test throttling with the new high default, we would need the worker to respect a lower limit.
        // For now, we'll verify if the messages are processed.
        // To REALLY test throttling, we should set a low limit for this specific MOCK_SESSION_ID in Redis or similar.
        
        if (cycles > 10) {
            console.log(`[ThrottleTest] Test cycle finished.`);
            if (counts.completed <= 10 && counts.delayed >= 450) {
                console.log(`[SUCCESS] Throttling correctly kicked in with custom limit!`);
            } else {
                console.log(`[FAILED] Rate limiter failed. Completed: ${counts.completed}, Delayed: ${counts.delayed}`);
            }
            isDone = true;
        }
    }

    console.log(`[ThrottleTest] Test Concluded.`);
    await disconnectRedis();
    await prisma.$disconnect();
    process.exit(0);
}

run().catch(console.error);
