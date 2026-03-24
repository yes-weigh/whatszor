import { prisma } from '../prisma/client';
import { getRedisClient } from '../core/redis';
import { getQueue, QueueName } from '../queues';
import { startWorkers, stopWorkers } from '../queues/worker';

async function generateMockPayload() {
    console.log("-----------------------------------------");
    console.log("   TESTING PHASE 3: WEBHOOK INGESTION    ");
    console.log("-----------------------------------------");

    console.log("\n🚀 Starting Background Queue Workers to process ingestion jobs...");
    startWorkers();

    const redis = getRedisClient();

    // 1. Create a dummy workspace & product for assertions
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) throw new Error("No workspace found. Run seed script first!");

    const product = await prisma.productKnowledge.create({
        data: {
            workspaceId: workspace.id,
            name: "Phase 3 Test Mock Product",
            sku: "TEST-SKU-999",
            status: "INCOMPLETE",
        }
    });

    console.log(`\n✅ 1. Created Mock Product: ${product.name} (ID: ${product.id})`);

    // 2. Mock TIER 1 MAPPING: Quoted Message in Redis
    const quotedMsgId = `mock_wa_msg_${Date.now()}`;
    await redis.set(`bot:msg:${quotedMsgId}`, product.id, 'EX', 3600);
    console.log(`✅ 2. Simulated Redis TIER 1 Memory: bot:msg:${quotedMsgId} -> ${product.id}`);

    // 3. Mock TIER 3 MAPPING: Active Session in Redis
    const senderPhoneTier3 = "919999999999";
    await redis.set(`bot:session:${senderPhoneTier3}`, product.id, 'EX', 3600);
    console.log(`✅ 3. Simulated Redis TIER 3 Memory: bot:session:${senderPhoneTier3} -> ${product.id}`);

    // 4. Dispatch Mocks to Ingestion Queue

    const ingestionQueue = getQueue(QueueName.KNOWLEDGE_INGESTION);

    // MOCK A: Tier 1 Match (Quoted Text)
    const msgIdA = `msg_A_${Date.now()}`;
    await ingestionQueue.add(msgIdA, {
        workspaceId: workspace.id,
        sessionId: "mock-session-id",
        messageId: msgIdA,
        senderPhone: "918888888888",
        payload: {
            key: { id: msgIdA, remoteJid: "918888888888@s.whatsapp.net", fromMe: false },
            message: {
                extendedTextMessage: {
                    text: "Here is the warranty info",
                    contextInfo: { stanzaId: quotedMsgId } // TIER 1 TRIGGER
                }
            }
        }
    }, { jobId: msgIdA });
    console.log(`\n📨 Enqueued Mock A (Tier 1: Quoted Match) as ${msgIdA}`);

    // MOCK B: Tier 2 Match (Regex Token)
    const msgIdB = `msg_B_${Date.now()}`;
    await ingestionQueue.add(msgIdB, {
        workspaceId: workspace.id,
        sessionId: "mock-session-id",
        messageId: msgIdB,
        senderPhone: "918888888888",
        payload: {
            key: { id: msgIdB, remoteJid: "918888888888@s.whatsapp.net", fromMe: false },
            message: {
                conversation: `The weight is 50kg. #PRD-${product.id}` // TIER 2 TRIGGER
            }
        }
    }, { jobId: msgIdB });
    console.log(`📨 Enqueued Mock B (Tier 2: Regex Match) as ${msgIdB}`);

    // MOCK C: Tier 3 Match (Active Session Memory)
    const msgIdC = `msg_C_${Date.now()}`;
    await ingestionQueue.add(msgIdC, {
        workspaceId: workspace.id,
        sessionId: "mock-session-id",
        messageId: msgIdC,
        senderPhone: senderPhoneTier3, // Matches TIER 3
        payload: {
            key: { id: msgIdC, remoteJid: `${senderPhoneTier3}@s.whatsapp.net`, fromMe: false },
            message: {
                conversation: `It includes a 2-year warranty.` // No quote, no token, hits session memory
            }
        }
    }, { jobId: msgIdC });
    console.log(`📨 Enqueued Mock C (Tier 3: Active Session) as ${msgIdC}`);

    // MOCK D: Tier 4 Match (Fallback / ORPHANED)
    const msgIdD = `msg_D_${Date.now()}`;
    await ingestionQueue.add(msgIdD, {
        workspaceId: workspace.id,
        sessionId: "mock-session-id",
        messageId: msgIdD,
        senderPhone: "917777777777", // Completely unknown user
        payload: {
            key: { id: msgIdD, remoteJid: "917777777777@s.whatsapp.net", fromMe: false },
            message: {
                conversation: "Here are some specifications but I didn't tell you for what."
            }
        }
    }, { jobId: msgIdD });
    console.log(`📨 Enqueued Mock D (Tier 4: Orphaned Fallback) as ${msgIdD}`);

    console.log("\n⏳ Waiting 5 seconds for background workers to process mappings...");
    await new Promise(r => setTimeout(r, 5000));

    // 5. Verification Assertions
    console.log("\n-----------------------------------------");
    console.log("           VERIFYING MAPPINGS            ");
    console.log("-----------------------------------------");
    
    const sourceA = await prisma.productKnowledgeSource.findUnique({ where: { messageId: msgIdA } });
    if (sourceA?.productId === product.id && sourceA.status === 'CONFLICT') {
        console.log(`✅ Mock A resolved correctly! (Status: ${sourceA.status}, mapped to ${sourceA.productId})`);
    } else {
        console.log(`❌ Mock A validation failed! Found:`, sourceA);
    }

    const sourceB = await prisma.productKnowledgeSource.findUnique({ where: { messageId: msgIdB } });
    if (sourceB?.productId === product.id && sourceB.status === 'CONFLICT') {
        console.log(`✅ Mock B resolved correctly! (Status: ${sourceB.status}, mapped to ${sourceB.productId})`);
    } else {
        console.log(`❌ Mock B validation failed! Found:`, sourceB);
    }

    const sourceC = await prisma.productKnowledgeSource.findUnique({ where: { messageId: msgIdC } });
    if (sourceC?.productId === product.id && sourceC.status === 'CONFLICT') {
        console.log(`✅ Mock C resolved correctly! (Status: ${sourceC.status}, mapped to ${sourceC.productId})`);
    } else {
        console.log(`❌ Mock C validation failed! Found:`, sourceC);
    }

    const sourceD = await prisma.productKnowledgeSource.findUnique({ where: { messageId: msgIdD } });
    if (!sourceD?.productId && sourceD?.status === 'ORPHANED') {
        console.log(`✅ Mock D resolved correctly! (Status: ${sourceD.status}, mapped to Orphaned successfully)`);
    } else {
        console.log(`❌ Mock D validation failed! Found:`, sourceD);
    }

    console.log("\n🛑 Stopping Background Workers...");
    await stopWorkers();

    console.log("\n✅ All assertions executed. Use BullMQ dashboard for deep logs.");
    process.exit(0);
}

generateMockPayload().catch(console.error);
