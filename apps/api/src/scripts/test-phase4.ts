import { prisma } from '../prisma/client';
import { getRedisClient } from '../core/redis';
import { getQueue, QueueName } from '../queues';
import { startWorkers, stopWorkers } from '../queues/worker';

async function generateMockPayload() {
    console.log("-----------------------------------------");
    console.log("   TESTING PHASE 4: AI EXTRACTION        ");
    console.log("-----------------------------------------");

    console.log("\n🚀 Starting Background Queue Workers to process ingestion jobs...");
    startWorkers();

    const redis = getRedisClient();

    const workspace = await prisma.workspace.findFirst();
    if (!workspace) throw new Error("No workspace found. Run seed script first!");

    const product = await prisma.productKnowledge.create({
        data: {
            workspaceId: workspace.id,
            name: "Phase 4 Test Robot",
            sku: "TEST-AI-444",
            status: "INCOMPLETE",
        }
    });

    console.log(`\n✅ 1. Created Mock Product: ${product.name} (ID: ${product.id})`);

    const quotedMsgId = `mock_wa_msg_ai_${Date.now()}`;
    await redis.set(`bot:msg:${quotedMsgId}`, product.id, 'EX', 3600);
    
    const ingestionQueue = getQueue(QueueName.KNOWLEDGE_INGESTION);

    // MOCK A: Text input
    const msgIdText = `msg_text_${Date.now()}`;
    await ingestionQueue.add(msgIdText, {
        workspaceId: workspace.id,
        sessionId: "mock-session-id",
        messageId: msgIdText,
        senderPhone: "918888888111",
        payload: {
            key: { id: msgIdText, remoteJid: "918888888111@s.whatsapp.net", fromMe: false },
            message: {
                extendedTextMessage: {
                    text: "The Phase 4 Test Robot has a titanium chassis, weighs exactly 120kg, and includes dual core processing features.",
                    contextInfo: { stanzaId: quotedMsgId } 
                }
            }
        }
    }, { jobId: msgIdText });
    console.log(`\n📨 Enqueued Mock A (Text Extractor) as ${msgIdText}`);

    // MOCK B: FAILED_VALIDATION simulation
    const msgIdBad = `msg_bad_${Date.now()}`;
    await ingestionQueue.add(msgIdBad, {
        workspaceId: workspace.id,
        sessionId: "mock-session-id",
        messageId: msgIdBad,
        senderPhone: "918888888222",
        payload: {
            key: { id: msgIdBad, remoteJid: "918888888222@s.whatsapp.net", fromMe: false },
            message: {
                extendedTextMessage: {
                    text: "Just saying hello to the bot, nothing about products.",
                    contextInfo: { stanzaId: quotedMsgId }
                }
            }
        }
    }, { jobId: msgIdBad });
    console.log(`📨 Enqueued Mock B (Irrelevant Input) as ${msgIdBad}`);

    console.log("\n⏳ Waiting 15 seconds for AI to process...");
    await new Promise(r => setTimeout(r, 15000));

    console.log("\n-----------------------------------------");
    console.log("           VERIFYING EXTRACTIONS         ");
    console.log("-----------------------------------------");
    
    const sourceText = await prisma.productKnowledgeSource.findUnique({ where: { messageId: msgIdText } });
    if (sourceText) {
        console.log(`\n✅ Mock A (Text) Results:`);
        console.log(`Status: ${sourceText.status}`);
        console.log(`Extracted JSON:`, JSON.stringify(sourceText.extractedData, null, 2));
        console.log(`Field Confidence:`, JSON.stringify(sourceText.fieldConfidence, null, 2));
        console.log(`Global Confidence: ${sourceText.globalConfidence}`);
    } else {
        console.log(`❌ Mock A (Text) failed to process!`);
    }

    const sourceBad = await prisma.productKnowledgeSource.findUnique({ where: { messageId: msgIdBad } });
    if (sourceBad) {
        console.log(`\n✅ Mock B (Irrelevant Input) Results:`);
        console.log(`Status: ${sourceBad.status}`);
        console.log(`Extracted JSON:`, JSON.stringify(sourceBad.extractedData, null, 2));
        console.log(`Field Confidence:`, JSON.stringify(sourceBad.fieldConfidence, null, 2));
        console.log(`Global Confidence: ${sourceBad.globalConfidence}`);
    } else {
         console.log(`❌ Mock B (Irrelevant Input) failed to process!`);
    }

    console.log("\n🛑 Stopping Background Workers...");
    await stopWorkers();

    console.log("\n✅ All assertions executed.");
    process.exit(0);
}

generateMockPayload().catch(console.error);
