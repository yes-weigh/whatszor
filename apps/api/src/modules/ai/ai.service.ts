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

    const history = conversation.messages.reverse().map(msg => ({
        role: msg.direction === 'INBOUND' ? 'user' : 'model',
        parts: [{ text: msg.content || '[Media Message]' }]
    }));

    return { conversation, contact, history };
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

        if (response.functionCalls && response.functionCalls.length > 0) {
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
