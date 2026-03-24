// @ts-nocheck
import { createServer } from '../core/server';
import { prisma, connectDatabase } from '../prisma/client';
import { signAccessToken } from '../core/jwt';
import { getRedisClient, connectRedis } from '../core/redis';
import FormData from 'form-data';
import { waManager } from '../modules/whatsapp/whatsapp.service';
import { processKnowledgeOutreachJob } from '../modules/knowledge/knowledge.worker';

async function runTests() {
    console.log("🔄 Initializing Phase 2 testing suite...");
    const server = await createServer();
    await connectDatabase();
    await connectRedis();

    const workspace = await prisma.workspace.findFirst();
    if (!workspace) throw new Error("No workspace found for tests.");

    await prisma.workspace.update({ where: { id: workspace.id }, data: { status: 'ACTIVE' } });

    // Generate mock JWT
    const token = await signAccessToken({
        sub: "test-phase2-user",
        workspaceId: workspace.id,
        role: "OWNER"
    });

    try {
        console.log("\n--- Test 1: POST /api/v1/products/import (CSV) ---");
        
        const csvContent = Buffer.from(
            `name,sku,price,category\n` +
            `Industrial Drill,DRL-001,150.00,Tools\n` +
            `Power Saw,SAW-002,,Tools\n` +
            `Safety Goggles,GOG-003,15.50,Safety\n`
        );

        // Since fastify-multipart requires proper Form-Data boundaries, we'll simulate the multipart body
        const form = new FormData();
        form.append('file', csvContent, { filename: 'catalog.csv', contentType: 'text/csv' });

        const importRes = await server.inject({
            method: 'POST',
            url: '/api/v1/products/import',
            headers: {
                ...form.getHeaders(),
                authorization: `Bearer ${token}`
            },
            payload: form
        });

        console.log(`Status: ${importRes.statusCode}`);
        console.log(importRes.json());
        
        // Ensure products exist in DB
        const products = await prisma.productKnowledge.findMany({
            where: { workspaceId: workspace.id, sku: { in: ['DRL-001', 'SAW-002', 'GOG-003'] } }
        });
        console.log(`Verified ${products.length} products inserted via CSV map.`);


        console.log("\n--- Test 2: Outreach Worker Mock & Redis Tracking ---");

        // Mock a Whatsapp Connected state so the worker doesn't fail
        await prisma.whatsAppAccount.upsert({
            where: { sessionId: 'mock-session-id' },
            create: {
                workspaceId: workspace.id,
                sessionId: 'mock-session-id',
                name: 'Test Bot',
                status: 'CONNECTED',
                phoneNumber: '+919999999999'
            },
            update: {
                status: 'CONNECTED'
            }
        });

        // Intercept Baileys Socket to mock sending
        const interceptedPayloads = [];
        waManager.getSafeSocket = () => ({
            sendMessage: async (jid: string, payload: any) => {
                interceptedPayloads.push({ jid, payload });
                return { key: { id: `mock_msg_${Math.floor(Math.random() * 1000)}` } };
            }
        });

        // Run worker synchronously for test isolation
        const testPhone = "919999999999";
        
        // Let's clear the ratelimit key before running
        const redis = getRedisClient();
        const today = new Date().toISOString().split('T')[0];
        await redis.del(`bot:ratelimit:outbound:${testPhone}:${today}`);

        console.log("Triggering worker process synchronously...");
        await processKnowledgeOutreachJob({
            id: 'mock-job-1',
            data: { workspaceId: workspace.id, phone: testPhone }
        } as any);

        console.log(`\n✅ Intercepted ${interceptedPayloads.length} messages sent to Baileys WS.`);
        if (interceptedPayloads.length > 0) {
            console.log("Sample Payload dispatched:");
            console.log(interceptedPayloads[0].payload.text);
        }

        console.log("\n--- Test 3: Redis Integrity Checks ---");
        // Verify keys exist
        const keys = await redis.keys('bot:*');
        console.log(`Found ${keys.length} bot:* context keys in Redis.`);
        for (const key of keys) {
            const ttl = await redis.ttl(key);
            const val = await redis.get(key);
            console.log(`Key: [${key}] | Val: [${val}] | TTL: ${ttl}s`);
        }

    } catch (err) {
        console.error("Test Failed:", err);
    } finally {
        await server.close();
        process.exit(0);
    }
}

runTests();
