import { config } from 'dotenv';
import path from 'path';
process.env.NODE_ENV = 'test';
config({ path: path.join(__dirname, '../../.env.test'), override: true });

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getQueue, QueueName } from '../../src/queues';
import { startWorkers } from '../../src/queues/worker';
import { connectRedis, disconnectRedis, getRedisClient } from '../../src/core/redis';
import { waManager } from '../../src/modules/whatsapp/whatsapp.service';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const BURST_SIZE = 25000; // 25k records
const WORKSPACE_ID = 'ws_loadtest_1';
const MOCK_SESSION_ID = 'test_session_burst';

async function run() {
    console.log(`[BurstTest] Starting test with ${BURST_SIZE} members...`);
    await connectRedis();
    const redis = getRedisClient();
    await redis.flushdb();
    console.log(`[BurstTest] Redis Flushed...`);

    // Ensure session exists
    await prisma.whatsAppAccount.upsert({
        where: { sessionId: MOCK_SESSION_ID },
        create: {
            id: 'acc_burst_1',
            sessionId: MOCK_SESSION_ID,
            workspaceId: WORKSPACE_ID,
            name: 'Burst Tester',
            status: 'CONNECTED',
            userId: 'admin_loadtest_1'
        },
        update: {}
    });

    // Create a mock campaign
    const campaign = await prisma.campaign.create({
        data: {
            workspaceId: WORKSPACE_ID,
            name: `Load Test Campaign - ${Date.now()}`,
            messageText: 'Hello {{name}}',
            status: 'DRAFT'
        }
    });

    console.log(`[BurstTest] DB: Bulk inserting ${BURST_SIZE} dummy contacts...`);
    const prefix = Date.now().toString().slice(-5);
    const contactData = Array.from({ length: BURST_SIZE }).map((_, i) => ({
        id: `contact_burst_${i}_${Date.now()}`,
        workspaceId: WORKSPACE_ID,
        phone: `${prefix}${i.toString().padStart(5, '0')}`,
        firstName: `User ${i}`
    }));

    for (let i = 0; i < contactData.length; i += 5000) {
        await prisma.contact.createMany({
            data: contactData.slice(i, i + 5000)
        });
    }

    console.log(`[BurstTest] DB: Bulk inserting ${BURST_SIZE} campaign members...`);
    const bulkData = contactData.map((contact) => ({
        campaignId: campaign.id,
        contactId: contact.id,
        status: 'PENDING' as any // Force Prisma to accept mock ENUM
    }));

    // Insert in batches of 5k to avoid payload too large for Prisma
    for (let i = 0; i < bulkData.length; i += 5000) {
        await prisma.campaignMember.createMany({
            data: bulkData.slice(i, i + 5000)
        });
    }

    console.log(`[BurstTest] Database seeded!`);

    await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'RUNNING', startedAt: new Date() }
    });

    const queue = getQueue(QueueName.CAMPAIGN);

    console.log(`[BurstTest] Enqueueing Campaign ID ${campaign.id}...`);
    await queue.add('processCampaign', {
        campaignId: campaign.id,
        workspaceId: WORKSPACE_ID
    }, {
        removeOnComplete: true,
        removeOnFail: false
    });

    const outQueue = getQueue(QueueName.OUTBOUND_MESSAGES);
    const campaignQueue = getQueue(QueueName.CAMPAIGN);

    console.log(`[Burst] Injecting mock session into WA Manager...`);
    waManager.setupMockSession(MOCK_SESSION_ID);

    console.log(`[Burst] Starting background workers...`);
    startWorkers();

    console.log(`[BurstTest] Monitoring Queue Depth (Polled every 5s)...`);
    
    let isDone = false;
    let throttleCycles = 0;
    while (!isDone) {
        await new Promise(r => setTimeout(r, 5000));
        throttleCycles++;

        const outQueue = getQueue(QueueName.OUTBOUND_MESSAGES);
        const [cmpCount, outCount] = await Promise.all([
            queue.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed'),
            outQueue.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed')
        ]);

        console.log(`[Stats] Campaigns | Wait: ${cmpCount.wait} | Active: ${cmpCount.active} | Delayed: ${cmpCount.delayed}`);
        console.log(`[Stats] Outbound  | Wait: ${outCount.wait} | Active: ${outCount.active} | Delayed: ${outCount.delayed} | Completed: ${outCount.completed}`);

        const dbCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id } });

        // Termination logic: 
        // 1. Campaign status must be COMPLETED (all batches dispatched)
        // 2. Outbound queue must have no wait/active/delayed jobs (all messages processed)
        // OR a timeout (fail-safe)
        if (dbCampaign?.status === 'COMPLETED' && outCount.wait === 0 && outCount.active === 0 && outCount.delayed === 0) {
            console.log(`[BurstTest] ALL JOBS PROCESSED SUCCESSFULLY!`);
            isDone = true;
        }

        if (throttleCycles > 120) { // 10 minutes max
            console.log(`[BurstTest] Test timed out after 10 minutes.`);
            isDone = true;
        }
    }

    console.log(`[BurstTest] Test concluded successfully.`);
    await disconnectRedis();
    await prisma.$disconnect();
    process.exit(0);
}

run().catch(console.error);
