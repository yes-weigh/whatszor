/**
 * automation-insights.service.ts
 *
 * Phase 3: Self-Learning Automation Insights Engine
 *
 * Scans recent inbound messages, groups by normalised keyword/phrase clusters,
 * and surfaces high-frequency patterns as suggested automations.
 *
 * AI is used ONLY to generate the suggestedReply — scanning is pure SQL.
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';
import { GoogleGenAI } from '@google/genai';
import { env } from '../../env';

const log = createLogger({ module: 'automation-insights' });
const genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// ── Configuration ─────────────────────────────────────────────────────────────
const SCAN_WINDOW_HOURS = 72;           // look back 3 days
const MIN_FREQUENCY = 5;               // only suggest if keyword seen 5+ times
const MAX_INSIGHTS_PER_RUN = 10;       // cap suggestions per scan
const MIN_WORD_LENGTH = 3;             // skip very short noise words
const STOP_WORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
    'her', 'was', 'one', 'our', 'out', 'get', 'has', 'him', 'his',
    'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who',
    'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
    'yes', 'okay', 'ok', 'hey', 'hi', 'hello', 'thanks', 'thank',
    'please', 'good', 'great', 'nice', 'sure', 'want', 'need',
]);

// Intent detection from keyword clusters
const INTENT_MAP: Array<{ keywords: string[]; intent: string }> = [
    { keywords: ['price', 'cost', 'rate', 'charge', 'fee', 'pricing', 'rates', 'how much', 'amount'], intent: 'pricing' },
    { keywords: ['demo', 'trial', 'try', 'test', 'sample', 'showcase', 'show me'], intent: 'demo_request' },
    { keywords: ['order', 'buy', 'purchase', 'book', 'place order', 'how to order'], intent: 'purchase_intent' },
    { keywords: ['delivery', 'shipping', 'dispatch', 'track', 'courier', 'when will'], intent: 'delivery_inquiry' },
    { keywords: ['available', 'availability', 'stock', 'in stock', 'out of stock'], intent: 'availability' },
    { keywords: ['discount', 'offer', 'deal', 'coupon', 'promo', 'code', 'sale', 'off'], intent: 'discount' },
    { keywords: ['support', 'help', 'issue', 'problem', 'broken', 'error', 'not working', 'complaint'], intent: 'support' },
    { keywords: ['refund', 'return', 'cancel', 'exchange', 'money back'], intent: 'refund' },
    { keywords: ['contact', 'address', 'location', 'number', 'email', 'where are'], intent: 'contact_info' },
    { keywords: ['open', 'hours', 'timing', 'when do', 'time'], intent: 'business_hours' },
];

function detectIntent(keyword: string): string {
    const lower = keyword.toLowerCase();
    for (const { keywords, intent } of INTENT_MAP) {
        if (keywords.some(k => lower.includes(k) || k.includes(lower))) {
            return intent;
        }
    }
    return 'general_inquiry';
}

function normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

/** Extract meaningful single-word tokens and short phrases from a message */
function extractCandidates(text: string): string[] {
    const normalized = normalizeText(text);
    const words = normalized.split(' ').filter(w =>
        w.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(w)
    );

    const candidates: string[] = [...words];

    // Also extract bigrams (two-word phrases) for compound keywords like "how much"
    for (let i = 0; i < words.length - 1; i++) {
        candidates.push(`${words[i]} ${words[i + 1]}`);
    }

    return [...new Set(candidates)];
}

/** Use Gemini Flash to generate a business-appropriate reply for a pattern */
async function generateSuggestedReply(keyword: string, intent: string, exampleMessages: string[]): Promise<string> {
    try {
        const examples = exampleMessages.slice(0, 3).map(m => `- "${m}"`).join('\n');
        const prompt = `You are an AI assistant for a WhatsApp business bot.

A keyword pattern has been detected: "${keyword}" (intent: ${intent}).

Example messages from leads that triggered this pattern:
${examples}

Generate a concise, professional WhatsApp auto-reply message (max 3 sentences) that:
1. Acknowledges the lead's inquiry naturally
2. Provides a helpful, business-appropriate response
3. Ends with a clear next step or call to action

Reply ONLY with the message text. No quotes, no explanation. Keep it conversational and brief. Use emojis sparingly (1-2 max).`;

        const response = await genai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        return response.text?.trim() ?? `Thanks for your message about "${keyword}"! Our team will get back to you shortly. 👋`;
    } catch (err) {
        log.warn({ err, keyword }, 'AI reply generation failed — using fallback');
        return `Hi! Thanks for asking about "${keyword}". Our team will get back to you shortly with all the details! 😊`;
    }
}

// ── Main Scanner ──────────────────────────────────────────────────────────────

export interface InsightScanResult {
    workspaceId: string;
    scanned: number;
    newInsights: number;
    skipped: number;
}

/**
 * Core scan function for a single workspace.
 * 1. Pull recent inbound messages
 * 2. Extract keyword candidates
 * 3. Count frequencies
 * 4. Filter by threshold + existing automations/insights
 * 5. Generate AI reply for new patterns
 * 6. Upsert AutomationInsight records
 */
export async function scanWorkspaceForInsights(workspaceId: string): Promise<InsightScanResult> {
    const since = new Date(Date.now() - SCAN_WINDOW_HOURS * 60 * 60 * 1000);

    // 1. Fetch recent inbound messages with text content
    const messages = await prisma.message.findMany({
        where: {
            workspaceId,
            direction: 'INBOUND',
            type: 'TEXT',
            content: { not: null },
            createdAt: { gte: since },
        },
        select: { id: true, content: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 2000, // cap to prevent perf issues
    });

    if (messages.length === 0) {
        return { workspaceId, scanned: 0, newInsights: 0, skipped: 0 };
    }

    // 2. Extract keyword candidates from each message and count frequencies
    const keywordFreq = new Map<string, { count: number; examples: string[] }>();
    for (const msg of messages) {
        if (!msg.content) continue;
        const candidates = extractCandidates(msg.content);
        for (const candidate of candidates) {
            const existing = keywordFreq.get(candidate);
            if (existing) {
                existing.count++;
                if (existing.examples.length < 5) existing.examples.push(msg.content);
            } else {
                keywordFreq.set(candidate, { count: 1, examples: [msg.content] });
            }
        }
    }

    // 3. Filter by minimum frequency threshold
    const highFreq = [...keywordFreq.entries()]
        .filter(([, v]) => v.count >= MIN_FREQUENCY)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, MAX_INSIGHTS_PER_RUN * 3); // extra buffer before exclusion check

    if (highFreq.length === 0) {
        return { workspaceId, scanned: messages.length, newInsights: 0, skipped: 0 };
    }

    // 4. Exclude keywords that already have an active automation OR pending insight
    const [existingAutomations, existingInsights] = await Promise.all([
        (prisma as any).keywordAutomation.findMany({
            where: { workspaceId, isActive: true },
            select: { keyword: true },
        }),
        (prisma as any).automationInsight.findMany({
            where: { workspaceId, status: 'pending' },
            select: { keyword: true },
        }),
    ]);

    const coveredKeywords = new Set<string>([
        ...existingAutomations.map((a: any) => normalizeText(a.keyword)),
        ...existingInsights.map((i: any) => normalizeText(i.keyword)),
    ]);

    const newCandidates = highFreq
        .filter(([keyword]) => !coveredKeywords.has(normalizeText(keyword)))
        .slice(0, MAX_INSIGHTS_PER_RUN);

    if (newCandidates.length === 0) {
        return { workspaceId, scanned: messages.length, newInsights: 0, skipped: highFreq.length };
    }

    // 5. Generate AI replies and create insights
    let newInsights = 0;
    for (const [keyword, { count, examples }] of newCandidates) {
        try {
            const intent = detectIntent(keyword);
            const suggestedReply = await generateSuggestedReply(keyword, intent, examples);

            await (prisma as any).automationInsight.create({
                data: {
                    workspaceId,
                    keyword,
                    intent,
                    frequency: count,
                    suggestedReply,
                    exampleMessages: examples.slice(0, 5),
                    status: 'pending',
                },
            });

            newInsights++;
            log.info({ workspaceId, keyword, intent, frequency: count }, 'New automation insight created');
        } catch (err: any) {
            // Unique constraint violation = insight already exists in a different status — skip silently
            if (err?.code === 'P2002') {
                log.debug({ workspaceId, keyword }, 'Insight already exists — skipping');
            } else {
                log.warn({ err, workspaceId, keyword }, 'Failed to create insight');
            }
        }
    }

    return {
        workspaceId,
        scanned: messages.length,
        newInsights,
        skipped: highFreq.length - newCandidates.length,
    };
}

/**
 * Scan all workspaces. Called by the BullMQ scheduled job.
 */
export async function scanAllWorkspacesForInsights(): Promise<void> {
    const workspaces = await prisma.workspace.findMany({
        select: { id: true },
    });

    log.info({ count: workspaces.length }, 'Starting insight scan for all workspaces');

    for (const ws of workspaces) {
        try {
            const result = await scanWorkspaceForInsights(ws.id);
            log.info(result, 'Workspace insight scan complete');
        } catch (err) {
            log.warn({ err, workspaceId: ws.id }, 'Insight scan failed for workspace — continuing');
        }
    }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getInsights(workspaceId: string, status = 'pending') {
    return (prisma as any).automationInsight.findMany({
        where: { workspaceId, status },
        orderBy: { frequency: 'desc' },
    });
}

/**
 * Accept an insight: creates a KeywordAutomation from it and marks as accepted.
 */
export async function acceptInsight(workspaceId: string, id: string): Promise<any> {
    const insight = await (prisma as any).automationInsight.findFirst({
        where: { id, workspaceId, status: 'pending' },
    });
    if (!insight) throw new Error('Insight not found or already resolved');

    // Create the automation
    const automation = await (prisma as any).keywordAutomation.create({
        data: {
            workspaceId,
            keyword: insight.keyword,
            matchType: 'contains',
            replyText: insight.suggestedReply,
            intent: insight.intent,
            cooldownSec: 30,
            isActive: true,
        },
    });

    // Mark insight as accepted
    await (prisma as any).automationInsight.update({
        where: { id },
        data: { status: 'accepted', resolvedAt: new Date() },
    });

    return automation;
}

/**
 * Dismiss an insight (won't resurface until next scan window generates new data).
 */
export async function dismissInsight(workspaceId: string, id: string): Promise<void> {
    await (prisma as any).automationInsight.updateMany({
        where: { id, workspaceId, status: 'pending' },
        data: { status: 'dismissed', resolvedAt: new Date() },
    });
}
