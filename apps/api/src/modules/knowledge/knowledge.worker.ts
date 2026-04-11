import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { logEvent } from '../../core/event-logger';
import { getRedisClient } from '../../core/redis';
import { waManager } from '../whatsapp/whatsapp.service';
import { createLogger } from '../../core/logger';

const log = createLogger({ module: 'knowledge-worker' });

export async function processKnowledgeOutreachJob(job: Job) {
    const { workspaceId, phone } = job.data as { workspaceId: string, phone: string };
    if (!workspaceId || !phone) {
        log.warn({ jobId: job.id }, 'Missing workspaceId or phone payload');
        return;
    }

    // ── Workspace suspension guard ────────────────────────────────────────────
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { status: true },
    });
    if (!workspace || workspace.status === 'SUSPENDED') {
        log.warn({ workspaceId, jobId: job.id }, 'Skipping knowledge outreach — workspace suspended or missing');
        return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    const targetNumber = phone.replace(/[^0-9]/g, '');
    const redis = getRedisClient();
    const today = new Date().toISOString().split('T')[0];
    const rateLimitKey = `bot:ratelimit:outbound:${targetNumber}:${today}`;


    // 1. Check Rate Limit instantly
    let currentSent = parseInt((await redis.get(rateLimitKey)) || '0', 10);
    if (currentSent >= 10) {
        log.warn({ phone: targetNumber }, 'Daily outreach rate limit exceeded (10 max).');
        return;
    }

    // 2. Fetch WhatsApp Connection
    const account = await prisma.whatsAppAccount.findFirst({
        where: { workspaceId, status: 'CONNECTED' }
    });
    if (!account) {
        throw new Error(`No CONNECTED WhatsApp account found for workspace ${workspaceId}`);
    }

    const sock = waManager.getSafeSocket(account.sessionId);
    if (!sock) {
        throw new Error(`Safe socket not initialized for session ${account.sessionId}`);
    }

    // 3. Find Eligibile Products (INCOMPLETE, >0 missing fields, >48h cooldown)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const products = await prisma.productKnowledge.findMany({
        where: {
            workspaceId,
            status: 'INCOMPLETE',
            missingFieldsCount: { gt: 0 },
            OR: [
                { lastOutreachAt: null },
                { lastOutreachAt: { lt: fortyEightHoursAgo } }
            ]
        },
        orderBy: [
            { missingFieldsCount: 'desc' },
            { lastOutreachAt: 'asc' }
        ],
        take: 10 - currentSent // Only fetch up to remaining quota
    });

    if (products.length === 0) {
        log.info({ workspaceId }, 'No eligible products needing outreach right now.');
        return;
    }

    const jid = `${targetNumber}@s.whatsapp.net`;

    // 4. Dispatch messages and record context
    for (const p of products) {
        // Enforce loop-level dynamic check in case of concurrency
        currentSent = parseInt((await redis.get(rateLimitKey)) || '0', 10);
        if (currentSent >= 10) {
            log.info({ phone: targetNumber }, 'Hit 10/day ratelimit mid-loop, breaking.');
            break;
        }

        const text = `🤖 *Product Knowledge Bot*\n\nHi! Let's fill out our catalog details.\n\n*Product:* ${p.name}\n*SKU:* ${p.sku || 'N/A'}\n*Token:* #PRD-${p.id}\n\nPlease reply directly to this message with descriptions, specifications, photos, PDFs, or a voice note.`;

        try {
            const sentMsg = await sock.sendMessage(jid, { text });
            const msgId = sentMsg?.key?.id;

            if (msgId) {
                // Store Redis Context layer
                // Message-level context TTL: 7 days
                await redis.set(`bot:msg:${msgId}`, p.id, 'EX', 7 * 24 * 60 * 60);
                // Active session context TTL: 1 hour
                await redis.set(`bot:session:${targetNumber}`, p.id, 'EX', 60 * 60);
                log.info({ msgId, productId: p.id, phone: targetNumber }, 'Stored bot routing context in Redis');
                logEvent(workspaceId, 'knowledge_question_asked', 'knowledge_worker', {
                    productId: p.id,
                    phone: targetNumber,
                    messageId: msgId
                });
            }

            // Mark product Outreach completion
            await prisma.productKnowledge.update({
                where: { id: p.id },
                data: { lastOutreachAt: new Date() }
            });

            // Increment ratelimit tracker + Add TTL bounds
            await redis.incr(rateLimitKey);
            const ttl = await redis.ttl(rateLimitKey);
            if (ttl === -1) {
                await redis.expire(rateLimitKey, 24 * 60 * 60); // 1 Day
            }

        } catch (err) {
            log.error({ err, productId: p.id }, 'Failed to dispatch Outreach message');
        }
    }

    log.info({ workspaceId, updated: products.length }, 'Successfully dispatched chunk of product outreaches.');
}
