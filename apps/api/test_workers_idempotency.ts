import { prisma } from './src/prisma/client';
import { getRedisClient } from './src/core/redis';
import { processInboundMessage } from './src/core/workers/inbound-message.worker';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';

async function setupTestDb() {
    const workspaceId = 'test-workspace-' + randomUUID();
    const sessionId = 'test-session';
    const remoteJid = '1234567890@s.whatsapp.net';

    await prisma.workspace.upsert({
        where: { id: workspaceId },
        update: {},
        create: {
            id: workspaceId,
            name: 'Test Workspace',
            slug: 'test-ws-' + randomUUID().substring(0, 8),
        }
    });

    await prisma.whatsAppAccount.upsert({
        where: { sessionId },
        update: {},
        create: {
            id: randomUUID(),
            workspaceId,
            sessionId,
            phoneNumber: '1234567890',
            name: 'Test Account',
            status: 'CONNECTED'
        }
    });

    return { workspaceId, sessionId, remoteJid };
}

async function testConcurrency() {
    console.log('--- Running Concurrency Test ---');
    const { workspaceId, sessionId, remoteJid } = await setupTestDb();
    const messageId = randomUUID();

    const jobData = {
        workspaceId,
        sessionId,
        messages: [{
            key: {
                remoteJid,
                id: messageId,
                fromMe: false,
            },
            message: {
                conversation: 'Hello Concurrency!'
            },
            pushName: 'Test User'
        }]
    };

    const mockJob = { data: jobData, attemptsMade: 1 } as unknown as Job;

    console.log('Firing 10 concurrent inbound messages with the same ID...');
    const promises = Array(10).fill(0).map(() => processInboundMessage(mockJob));
    
    await Promise.allSettled(promises);

    const msgs = await prisma.message.findMany({ where: { remoteId: messageId } });
    console.log(`Saved messages count (Expected: 1): ${msgs.length}`);
    
    const convs = await prisma.conversation.findMany({ where: { workspaceId } });
    if (convs.length > 0) {
        console.log(`Conversation unread count (Expected: 1): ${convs[0].unreadCount}`);
    }

    if (msgs.length === 1 && convs[0]?.unreadCount === 1) {
        console.log('✅ Concurrency test passed.\n');
    } else {
        console.error('❌ Concurrency test failed.\n');
    }
}

async function testRetryStorm() {
    console.log('--- Running Retry Storm Test ---');
    const { workspaceId, sessionId, remoteJid } = await setupTestDb();
    const messageId = randomUUID();

    const jobData = {
        workspaceId,
        sessionId,
        messages: [{
            key: { remoteJid, id: messageId, fromMe: false },
            message: { conversation: 'Hello Retry Storm!' }
        }]
    };

    const mockJob = { data: jobData, attemptsMade: 1 } as unknown as Job;

    console.log('Simulating 5 sequential retries due to network failure AFTER processing...');
    for (let i = 0; i < 5; i++) {
        await processInboundMessage(mockJob);
    }

    const msgs = await prisma.message.findMany({ where: { remoteId: messageId } });
    console.log(`Saved messages count (Expected: 1): ${msgs.length}`);

    const convs = await prisma.conversation.findMany({ where: { workspaceId } });
    if (convs.length > 0) {
        console.log(`Conversation unread count (Expected: 1): ${convs[0].unreadCount}`);
    }

    if (msgs.length === 1 && convs[0]?.unreadCount === 1) {
        console.log('✅ Retry Storm test passed.\n');
    } else {
        console.error('❌ Retry Storm test failed.\n');
    }
}

async function runAll() {
    try {
        await testConcurrency();
        await testRetryStorm();
        console.log('Tests finished.');
    } catch (e) {
        console.error('Tests failed completely', e);
    } finally {
        await prisma.$disconnect();
        const redis = getRedisClient();
        redis.quit();
        process.exit(0);
    }
}

runAll();
