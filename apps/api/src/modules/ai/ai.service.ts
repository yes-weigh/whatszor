import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../../env';
import { createLogger } from '../../core/logger';
import { prisma } from '../../prisma/client';

const log = createLogger({ module: 'ai.service' });

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const MODEL = 'gemini-2.5-flash';

async function buildConversationContext(conversationId: string) {
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 10
            }
        }
    });

    if (!conversation) return null;

    const contact = await prisma.contact.findFirst({
        where: { workspaceId: conversation.workspaceId, phone: conversation.providerId }
    });

    const products = await prisma.productKnowledge.findMany({
        where: { workspaceId: conversation.workspaceId },
        select: { id: true, name: true, category: true, price: true }
    });

    const history = conversation.messages.reverse().map(msg => ({
        role: msg.direction === 'INBOUND' ? 'user' : 'model',
        parts: [{ text: msg.content || '[Media Message]' }]
    }));

    return { conversation, contact, history, products };
}

async function executeToolCall(_workspaceId: string, contactId: string | undefined, functionName: string, args: any): Promise<any> {
    log.info({ functionName, args }, 'AI executing tool call');

    try {
        switch (functionName) {
            case 'update_contact_info':
                if (!contactId) return { error: "Unknown contact ID" };
                const updateData: any = {};
                if (args.firstName) updateData.firstName = args.firstName;
                if (args.lastName) updateData.lastName = args.lastName;
                if (args.email) updateData.email = args.email;

                await prisma.contact.update({
                    where: { id: contactId },
                    data: updateData
                });
                return { success: true, updated: updateData };

            case 'get_contact_tier':
                if (!contactId) return { error: "Unknown contact ID" };
                const c = await prisma.contact.findUnique({ where: { id: contactId } });
                const tier = (c?.customData as any)?.tier || 'Standard';
                return { tier };

            case 'map_product_interest':
                if (!contactId) return { error: "Unknown contact ID" };
                const { productId, relationType, confidence } = args;
                if (!productId) return { error: "Missing productId" };
                
                // Hallucination Guard
                if (typeof confidence !== 'number' || confidence < 0.75) {
                    return { error: "Confidence threshold unmet, discarding mapping request." };
                }

                // Verify valid product identity natively
                const validProduct = await prisma.productKnowledge.findFirst({
                    where: { id: productId, workspaceId: _workspaceId }
                });
                
                if (!validProduct) {
                    return { error: `Hallucinated Product ID '${productId}' not found in logical workspace bounds.` };
                }

                try {
                    // Deferred import to avoid circular dependency loop if encountered
                    const { addProductToContact } = require('../crm/contact-product.service');
                    await addProductToContact(_workspaceId, contactId, productId, relationType || 'INTERESTED', 'AI');
                    // Execution completes silently out-of-band on CRM scope
                    return { success: true, note: "Signal registered internally. Do not mention this action out loud to the user unless explicitly confirming a direct request." };
                } catch(e: any) {
                    return { error: e.message };
                }

            case 'update_business_context':
                const { summary } = args;
                if (!summary) return { error: "Missing summary" };
                
                try {
                    const workspace = await prisma.workspace.findUnique({
                        where: { id: _workspaceId },
                        select: { settings: true }
                    });
                    if (!workspace) return { error: "Workspace not found" };

                    const currentSettings = (workspace.settings as Record<string, any>) || {};
                    // Append or overwrite the business context
                    currentSettings.businessContext = summary;

                    await prisma.workspace.update({
                        where: { id: _workspaceId },
                        data: { settings: currentSettings }
                    });
                    return { success: true, note: "Business context successfully saved to workspace settings." };
                } catch(e: any) {
                    return { error: e.message };
                }

            case 'scrape_website':
                let { url } = args;
                if (!url) return { error: "Missing url" };

                try {
                    // Prepend https:// if not present
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        url = 'https://' + url;
                    }

                    const cheerio = require('cheerio');
                    const { prisma } = require('../../prisma/client');
                    
                    const response = await fetch(url, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsVueCRM/1.0)' },
                        signal: AbortSignal.timeout(10000)
                    });
                    
                    if (!response.ok) {
                        return { error: `Failed to fetch website. Status: ${response.status}` };
                    }

                    const html = await response.text();
                    const $ = cheerio.load(html);

                    // Extract meta tags which are critical for SPAs
                    const title = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
                    const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

                    // ── Extract Images ─────────────────────────────────────────────────
                    const baseOrigin = new URL(url).origin;
                    const imageSet = new Set<string>();

                    // og:image first (most reliable brand image)
                    const ogImg = $('meta[property="og:image"]').attr('content');
                    if (ogImg) {
                        try { imageSet.add(new URL(ogImg, baseOrigin).href); } catch {}
                    }
                    // All <img> tags
                    $('img').each((_: number, el: any) => {
                        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
                        if (!src || src.startsWith('data:')) return;
                        try { imageSet.add(new URL(src, baseOrigin).href); } catch {}
                    });
                    // srcset images
                    $('img[srcset], source[srcset]').each((_: number, el: any) => {
                        const srcset = $(el).attr('srcset') || '';
                        srcset.split(',').forEach((part: string) => {
                            const src = part.trim().split(' ')[0];
                            if (src && !src.startsWith('data:')) {
                                try { imageSet.add(new URL(src, baseOrigin).href); } catch {}
                            }
                        });
                    });

                    const imageUrls = Array.from(imageSet)
                        .filter((u: string) => /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(u))
                        .slice(0, 20); // cap at 20

                    // Persist suggested images to workspace settings (fire-and-forget)
                    if (_workspaceId && imageUrls.length > 0) {
                        prisma.workspace.findUnique({ where: { id: _workspaceId }, select: { settings: true } })
                            .then((ws: any) => {
                                const current = (ws?.settings as any) || {};
                                return prisma.workspace.update({
                                    where: { id: _workspaceId },
                                    data: { settings: { ...current, suggestedImages: imageUrls, suggestedImagesSource: url } }
                                });
                            })
                            .catch((e: any) => log.warn({ err: e }, 'Failed to persist suggestedImages'));
                    }
                    // ─────────────────────────────────────────────────────────────────

                    // Remove scripts, styles, navs, footer, ads to clean up DOM
                    $('script, style, noscript, iframe, nav, footer, header').remove();

                    // Extract all useful text segments
                    let rawText = '';
                    if (title) rawText += `Title: ${title.trim()}\n`;
                    if (description && description !== 'Web site created using create-react-app') rawText += `Description: ${description.trim()}\n`;
                    
                    $('h1, h2, h3, h4, h5, p, li, span, div').each((_: number, el: any) => {
                        const $el = $(el);
                        const isGeneric = el.tagName === 'div' || el.tagName === 'span';
                        if (isGeneric && $el.children().length > 0) return;
                        
                        const text = $el.text().replace(/\s+/g, ' ').trim();
                        if (text.length > 15) {
                            rawText += text + '\n';
                        }
                    });

                    const extracted = rawText.slice(0, 3000) + (rawText.length > 3000 ? '...' : '');

                    if (!extracted) {
                        return { error: "Website loaded but no readable text found." };
                    }
                    
                    return { 
                        success: true, 
                        content: extracted,
                        imagesFound: imageUrls.length,
                        note: "Here is the raw text extracted from the website. Read this carefully to understand their business model, then reply to the user naturally." 
                    };
                } catch(err: any) {
                    return { error: `Scraping failed: ${err.message}` };
                }

            default:
                return { error: `Unknown tool: ${functionName}` };
        }
    } catch (err: any) {
        log.error({ err, functionName }, 'Tool execution failed');
        return { error: err.message };
    }
}

export async function generateChatbotReply(workspaceId: string, conversationId: string): Promise<string | null> {
    const ctx = await buildConversationContext(conversationId);
    if (!ctx) return null;

    const systemInstruction = `
You are the Whatsvue AI Assistant, a helpful customer support agent for a CRM platform.
Your job is to assist the user on WhatsApp. Be concise, polite, and use emojis occasionally.
You have access to the CRM database via tools. 
If the user wants to update their email or name, use the update_contact_info tool.
If the user asks about their tier/loyalty status, use the get_contact_tier tool.

Context:
Customer Phone: ${ctx.conversation.providerId}
Customer Name: ${ctx.contact?.firstName || 'Unknown'} ${ctx.contact?.lastName || ''}

Available Workspace Products (Exact internal catalog):
${ctx.products.length ? ctx.products.map(p => `- ID: "${p.id}" | Name: "${p.name}" | Price: ${p.price || 'N/A'}`).join('\n') : "No products mapped."}

Important System Rule:
If the user indicates they are interested in, inquiring about, or wanting to buy a specific product listed above, you MUST call 'map_product_interest' silently. ONLY map if confidence is >= 0.75. Do NOT hallucinate IDs.
    `.trim();

    const tools: any[] = [{
        functionDeclarations: [
            {
                name: 'update_contact_info',
                description: 'Updates the CRM record for the current user chatting with you.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        firstName: { type: Type.STRING },
                        lastName: { type: Type.STRING },
                        email: { type: Type.STRING }
                    }
                }
            },
            {
                name: 'get_contact_tier',
                description: 'Returns the current loyalty/tier status of the customer.',
            },
            {
                name: 'map_product_interest',
                description: 'Registers deep sales intent tagging the current user against a literal catalog product natively.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        productId: { type: Type.STRING, description: "The EXACT valid ID from the explicit context catalog listed" },
                        relationType: { type: Type.STRING, description: "Must be exactly 'INTERESTED', 'CART', or 'OWNED' depending on context." },
                        confidence: { type: Type.NUMBER, description: "Float between 0.0 to 1.0 explicitly rating intention certainty." }
                    },
                    required: ["productId", "relationType", "confidence"]
                }
            }
        ]
    }];

    const messages: any[] = [...ctx.history];

    try {
        let response = await ai.models.generateContent({
            model: MODEL,
            contents: messages,
            config: {
                systemInstruction,
                tools,
                temperature: 0.4,
            }
        });

        let toolCallsCount = 0;
        const MAX_TOOL_CALLS = 5;

        while (response.functionCalls && response.functionCalls.length > 0 && toolCallsCount < MAX_TOOL_CALLS) {
            toolCallsCount++;
            const originalContent = response.candidates?.[0]?.content;
            if (originalContent) {
                messages.push(originalContent);
            } else {
                messages.push({
                    role: 'model',
                    parts: response.functionCalls.map(fc => ({ functionCall: fc }))
                });
            }

            const functionResponses = [];

            for (const call of response.functionCalls) {
                const callName = call.name || 'unknown';
                const result = await executeToolCall(workspaceId, ctx.contact?.id, callName, call.args);
                functionResponses.push({
                    functionResponse: {
                        name: callName,
                        response: result
                    }
                });
            }

            messages.push({
                role: 'user',
                parts: functionResponses
            });

            response = await ai.models.generateContent({
                model: MODEL,
                contents: messages,
                config: {
                    systemInstruction,
                    tools,
                    temperature: 0.4,
                }
            });
        }

        return response.text || null;

    } catch (err: any) {
        log.error({ err, conversationId }, 'Gemini generation failed');
        return null;
    }
}

// ── Flow Generator ────────────────────────────────────────────────────────────

const SUPPORTED_TRIGGER_TYPES = ['CONTACT_CREATED', 'CONTACT_UPDATED', 'MESSAGE_RECEIVED', 'TAG_ADDED'];
const SUPPORTED_NODE_TYPES = ['trigger', 'action', 'condition', 'delay', 'ai', 'integration', 'handoff'];
const SUPPORTED_ACTION_TYPES = ['SEND_WHATSAPP', 'ADD_TAG', 'DELAY', 'WEBHOOK', 'AI_REPLY', 'AI_INTENT', 'HUMAN_HANDOFF', 'HTTP_REQUEST'];

const FLOW_GENERATOR_SYSTEM_PROMPT = `You are an Automation Flow Designer for a WhatsApp CRM platform.
Your ONLY job is to convert a natural-language automation description into a valid JSON flow definition.

SUPPORTED TRIGGER TYPES: ${SUPPORTED_TRIGGER_TYPES.join(', ')}
SUPPORTED NODE TYPES: ${SUPPORTED_NODE_TYPES.join(', ')}
SUPPORTED ACTION TYPES: ${SUPPORTED_ACTION_TYPES.join(', ')}

RULES:
- NEVER use any type not listed above
- Always start with ONE trigger node at position {x:250,y:80}
- Space subsequent nodes 160px apart vertically (y:240, 400, 560...)
- All nodes must be connected via edges with unique ids (e1, e2...)
- Condition nodes have two outgoing edges: sourceHandle "true" and "false"
- Return ONLY valid compact JSON — no markdown, no explanation, no code fences

OUTPUT FORMAT:
{"name":"Short name","nodes":[{"id":"trigger-1","type":"trigger","position":{"x":250,"y":80},"data":{"triggerType":"TRIGGER_TYPE","label":"When ..."}}],"edges":[{"id":"e1","source":"trigger-1","target":"action-1","animated":true}]}

EXAMPLE 1: "When a new contact is created, send a welcome WhatsApp message"
{"name":"New Contact Welcome","nodes":[{"id":"trigger-1","type":"trigger","position":{"x":250,"y":80},"data":{"triggerType":"CONTACT_CREATED","label":"New Contact Created"}},{"id":"action-1","type":"action","position":{"x":250,"y":240},"data":{"actionType":"SEND_WHATSAPP","label":"Send Welcome","messageContent":"Welcome! How can we help you today?"}}],"edges":[{"id":"e1","source":"trigger-1","target":"action-1","animated":true}]}

EXAMPLE 2: "When someone messages asking about price, detect intent then send catalog"
{"name":"Price Inquiry Response","nodes":[{"id":"trigger-1","type":"trigger","position":{"x":250,"y":80},"data":{"triggerType":"MESSAGE_RECEIVED","label":"Message Received"}},{"id":"ai-1","type":"ai","position":{"x":250,"y":240},"data":{"actionType":"AI_INTENT","label":"Detect Price Inquiry"}},{"id":"action-1","type":"action","position":{"x":250,"y":400},"data":{"actionType":"SEND_WHATSAPP","label":"Send Catalog","messageContent":"Here is our catalog!"}}],"edges":[{"id":"e1","source":"trigger-1","target":"ai-1","animated":true},{"id":"e2","source":"ai-1","target":"action-1","animated":true}]}

EXAMPLE 3: "New dealer tag added, send welcome, wait 24 hours, then follow up"
{"name":"Dealer Onboarding","nodes":[{"id":"trigger-1","type":"trigger","position":{"x":250,"y":80},"data":{"triggerType":"TAG_ADDED","label":"Dealer Tag Added"}},{"id":"action-1","type":"action","position":{"x":250,"y":240},"data":{"actionType":"SEND_WHATSAPP","label":"Welcome Dealer","messageContent":"Welcome to our dealer program!"}},{"id":"delay-1","type":"delay","position":{"x":250,"y":400},"data":{"label":"Wait 24 hours","delayMinutes":1440}},{"id":"action-2","type":"action","position":{"x":250,"y":560},"data":{"actionType":"SEND_WHATSAPP","label":"Follow Up","messageContent":"Ready to place your first order?"}}],"edges":[{"id":"e1","source":"trigger-1","target":"action-1","animated":true},{"id":"e2","source":"action-1","target":"delay-1","animated":true},{"id":"e3","source":"delay-1","target":"action-2","animated":true}]}`;

export async function generateFlow(description: string): Promise<{ name: string; nodes: any[]; edges: any[]; error?: string }> {
    try {
        const response = await ai.models.generateContent({
            model: MODEL,
            contents: [{ role: 'user', parts: [{ text: `Generate an automation flow for: ${description}` }] }],
            config: { systemInstruction: FLOW_GENERATOR_SYSTEM_PROMPT, temperature: 0.2 }
        });

        const raw = (response.text || '').trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

        let parsed: any;
        try {
            parsed = JSON.parse(raw);
        } catch {
            log.warn({ raw }, 'AI generated invalid JSON for flow');
            return { name: 'Generated Flow', nodes: [], edges: [], error: 'AI returned malformed JSON. Please rephrase your description.' };
        }

        const validNodeTypes = new Set(SUPPORTED_NODE_TYPES);
        const validActionTypes = new Set(SUPPORTED_ACTION_TYPES);
        const validTriggerTypes = new Set(SUPPORTED_TRIGGER_TYPES);

        const nodes: any[] = (parsed.nodes || []).filter((n: any) => {
            if (!validNodeTypes.has(n.type)) return false;
            if (n.type === 'trigger' && n.data?.triggerType && !validTriggerTypes.has(n.data.triggerType)) {
                n.data.triggerType = 'MESSAGE_RECEIVED'; // safe fallback
            }
            if (n.data?.actionType && !validActionTypes.has(n.data.actionType)) return false;
            return true;
        });

        const validNodeIds = new Set(nodes.map((n: any) => n.id));
        const edges: any[] = (parsed.edges || []).filter(
            (e: any) => validNodeIds.has(e.source) && validNodeIds.has(e.target)
        );

        return { name: parsed.name || 'AI Generated Flow', nodes, edges };
    } catch (err: any) {
        log.error({ err }, 'generateFlow failed');
        return { name: 'Generated Flow', nodes: [], edges: [], error: err.message };
    }
}
// ── Copilot / Suggestion Engine ──────────────────────────────────────────────

const SUGGESTION_SYSTEM_PROMPT = `You are a high-performing WhatsApp sales assistant for Indian businesses.

Your job:
- Identify customer intent based on their latest messages
- Generate short, friendly, conversion-focused replies
- Keep replies under 2 sentences
- Use simple English (India-friendly)
- Push toward next step (demo / close, if applicable)

Return ONLY valid JSON in format:
{
  "intent": "string (e.g. Pricing Inquiry, Technical Support, Greeting, etc.)",
  "confidence": 0.0 to 1.0,
  "suggestions": [
    "Short friendly reply 1",
    "Short friendly reply 2",
    "Short friendly reply 3"
  ]
}`;

export async function generateSuggestions(messages: any[], contact: any): Promise<{ intent?: string, confidence?: number, suggestions?: string[], error?: string }> {
    try {
        const historyText = messages.map(m => `${m.role}: ${m.content}`).join('\n');
        const contactInfo = contact ? `Name: ${contact.name || 'Unknown'}\nTags: ${(contact.tags || []).join(', ')}` : 'No contact info provided';

        const prompt = `Conversation History:\n${historyText}\n\nContact Info:\n${contactInfo}`;

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { 
                systemInstruction: SUGGESTION_SYSTEM_PROMPT, 
                temperature: 0.3,
                responseMimeType: "application/json"
            }
        });

        const raw = (response.text || '').trim();
        let parsed: any;
        try {
            parsed = JSON.parse(raw);
        } catch {
            log.warn({ raw }, 'AI generated invalid JSON for suggestions');
            return { error: 'Failed to parse AI intent and suggestions.' };
        }

        return {
            intent: parsed.intent || 'Unknown',
            confidence: parsed.confidence || 0,
            suggestions: parsed.suggestions || []
        };
    } catch (err: any) {
        log.error({ err }, 'generateSuggestions failed');
        return { error: err.message };
    }
}

// ── Onboarding / Setup Engine ────────────────────────────────────────────────

const ONBOARDING_SYSTEM_PROMPT = `You are a helpful and very polite AI assistant integrated into the WhatsVue CRM platform.
Your ONLY job right now is to welcome the user who just signed up and gather a smooth, organic business profile.

RULES:
1. Be extremely conversational, empathetic, and human-like.
2. Mirror the user's tone. If they are brief, be brief. If they are professional, be professional.
3. NEVER be pushy. If the user wants to skip or refuses to answer, acknowledge it gracefully and conclude.
4. Try to find out: what their business does, what industry they are in, if they are B2B or B2C, where they are located, and any key taglines or values.
5. Keep your responses short (max 2-3 sentences per reply). Do not overwhelm the user.
6. As soon as you learn any solid facts about their business, SILENTLY use the 'update_business_context' tool to save a cohesive Markdown summary of everything you know so far. Overwrite the summary to be comprehensive each time.
7. SUPERPOWER: You have a 'scrape_website' tool! Encourage the user to provide their website URL so you can instantly call 'scrape_website' to read their page, extract the context, and surprise them with your knowledge.

If there is no conversation history, you MUST send a welcoming first message using the contextual orgName and userEmail provided by the system. Example: "Hi [Name], welcome to [Org]! I'm here to help set things up. Do you have a website URL I can look at to quickly learn about your business?"
`;

export async function generateOnboardingChat(
    workspaceId: string, 
    messages: any[], 
    contextParams: { orgName: string; userEmail: string }
): Promise<{ text?: string, error?: string }> {
    try {
        const tools: any[] = [{
            functionDeclarations: [
                {
                    name: 'update_business_context',
                    description: 'Saves the current understanding of the user\'s business profile as a Markdown formatted summary. Call this silently in the background when you learn new facts.',
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { 
                                type: Type.STRING, 
                                description: "A comprehensive Markdown summary of the business (e.g. Industry, Location, B2B/B2C, Team Size, Products). Replace the old context entirely with this new exhaustive string." 
                            }
                        },
                        required: ["summary"]
                    }
                },
                {
                    name: 'scrape_website',
                    description: 'Extracts all readable text content from a URL to instantly learn about the users business. Automatically handles missing https:// prefixes.',
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            url: { 
                                type: Type.STRING, 
                                description: "The URL of the website to scrape, i.e. stripe.com or https://whatsvue.com" 
                            }
                        },
                        required: ["url"]
                    }
                }
            ]
        }];

        // If no messages, inject a system cue to force the AI to make the first move based on context
        const chatMessages = messages.length > 0 ? messages : [
            { role: 'user', parts: [{ text: `[SYSTEM] The user just signed up. orgName: "${contextParams.orgName}", userEmail: "${contextParams.userEmail}". Generate a welcoming first message to start the onboarding.` }] }
        ];

        let response = await ai.models.generateContent({
            model: MODEL,
            contents: chatMessages,
            config: {
                systemInstruction: ONBOARDING_SYSTEM_PROMPT,
                tools,
                temperature: 0.7, // slightly more creative and adaptable persona
            }
        });

        let toolCallsCount = 0;
        const MAX_TOOL_CALLS = 5;

        while (response.functionCalls && response.functionCalls.length > 0 && toolCallsCount < MAX_TOOL_CALLS) {
            toolCallsCount++;
            const originalContent = response.candidates?.[0]?.content;
            if (originalContent) {
                chatMessages.push(originalContent);
            } else {
                chatMessages.push({
                    role: 'model',
                    parts: response.functionCalls.map(fc => ({ functionCall: fc }))
                });
            }

            const functionResponses = [];

            for (const call of response.functionCalls) {
                const callName = call.name || 'unknown';
                const result = await executeToolCall(workspaceId, undefined, callName, call.args);
                functionResponses.push({
                    functionResponse: {
                        name: callName,
                        response: result
                    }
                });
            }

            chatMessages.push({
                role: 'user',
                parts: functionResponses
            });

            // Re-prompt to get text response after tool execution
            response = await ai.models.generateContent({
                model: MODEL,
                contents: chatMessages,
                config: {
                    systemInstruction: ONBOARDING_SYSTEM_PROMPT,
                    tools,
                    temperature: 0.7,
                }
            });
        }

        if (!response.text) {
             return { error: 'Empty response from AI.' };
        }

        return { text: response.text };

    } catch (err: any) {
        log.error({ err }, 'generateOnboardingChat failed');
        return { error: err.message };
    }
}

