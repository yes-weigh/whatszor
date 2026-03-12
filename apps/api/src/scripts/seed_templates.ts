/**
 * Seed built-in Automation Templates
 * Run: pnpm --filter api exec ts-node scripts/seed_templates.ts
 */
import { prisma } from '../prisma/client';

const TEMPLATES = [
    // ── Lead Capture ───────────────────────────────
    {
        name: 'New Lead Welcome',
        description: 'Send a welcome WhatsApp message instantly when a new contact is captured.',
        category: 'lead_capture',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'CONTACT_CREATED', label: 'New Contact Created' } },
                { id: 'action-1', type: 'action', position: { x: 250, y: 240 }, data: { actionType: 'SEND_WHATSAPP', label: 'Send Welcome Message', messageContent: 'Hi {{contact.firstName}}! Welcome to our service. How can we help you today? 😊' } }
            ],
            edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1', animated: true }]
        }
    },
    {
        name: 'Lead Tag & Assign',
        description: 'Auto-tag new leads and add them to your CRM pipeline for follow-up.',
        category: 'lead_capture',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'CONTACT_CREATED', label: 'New Contact Created' } },
                { id: 'action-1', type: 'action', position: { x: 250, y: 240 }, data: { actionType: 'ADD_TAG', label: 'Tag as New Lead', tagName: 'new-lead' } },
                { id: 'action-2', type: 'action', position: { x: 250, y: 400 }, data: { actionType: 'SEND_WHATSAPP', label: 'Notify Sales Team', messageContent: 'New lead captured: {{contact.firstName}} {{contact.lastName}} — {{contact.phone}}' } }
            ],
            edges: [
                { id: 'e1', source: 'trigger-1', target: 'action-1', animated: true },
                { id: 'e2', source: 'action-1', target: 'action-2', animated: true }
            ]
        }
    },

    // ── Customer Support ───────────────────────────
    {
        name: 'AI Support Reply',
        description: 'Use AI to automatically reply to inbound customer messages 24/7.',
        category: 'support',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'MESSAGE_RECEIVED', label: 'Message Received' } },
                { id: 'ai-1', type: 'ai', position: { x: 250, y: 240 }, data: { actionType: 'AI_REPLY', label: 'AI Auto-Reply', messageContent: 'You are a friendly support agent. Answer the customer question helpfully and concisely.' } }
            ],
            edges: [{ id: 'e1', source: 'trigger-1', target: 'ai-1', animated: true }]
        }
    },
    {
        name: 'Human Handoff Flow',
        description: 'Try AI first, then hand off to a human agent if the AI cannot resolve.',
        category: 'support',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'MESSAGE_RECEIVED', label: 'Message Received' } },
                { id: 'ai-1', type: 'ai', position: { x: 250, y: 240 }, data: { actionType: 'AI_INTENT', label: 'Detect Intent' } },
                { id: 'condition-1', type: 'condition', position: { x: 250, y: 400 }, data: { label: 'Resolved by AI?', field: 'ai.resolved', operator: 'eq', value: 'true' } },
                { id: 'handoff-1', type: 'handoff', position: { x: 500, y: 560 }, data: { label: 'Assign to Agent', assignTo: 'available_agent' } },
                { id: 'action-1', type: 'action', position: { x: 0, y: 560 }, data: { actionType: 'SEND_WHATSAPP', label: 'Close Ticket', messageContent: 'Thank you for contacting us! Is there anything else we can help you with? ✅' } }
            ],
            edges: [
                { id: 'e1', source: 'trigger-1', target: 'ai-1', animated: true },
                { id: 'e2', source: 'ai-1', target: 'condition-1', animated: true },
                { id: 'e3', source: 'condition-1', sourceHandle: 'true', target: 'action-1', animated: true },
                { id: 'e4', source: 'condition-1', sourceHandle: 'false', target: 'handoff-1', animated: true }
            ]
        }
    },

    // ── Dealer Inquiry ─────────────────────────────
    {
        name: 'Dealer Price Inquiry',
        description: 'When a dealer asks for price, send the catalog and notify the sales team.',
        category: 'dealer',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'MESSAGE_RECEIVED', label: 'Message Received' } },
                { id: 'ai-1', type: 'ai', position: { x: 250, y: 240 }, data: { actionType: 'AI_INTENT', label: 'Detect Price Inquiry Intent' } },
                { id: 'action-1', type: 'action', position: { x: 250, y: 400 }, data: { actionType: 'SEND_WHATSAPP', label: 'Send Catalog', messageContent: 'Hi {{contact.firstName}}! Here is our latest price catalog: [catalog link]. For bulk orders, reply BULK. 📋' } },
                { id: 'action-2', type: 'action', position: { x: 250, y: 560 }, data: { actionType: 'WEBHOOK', label: 'Notify Sales CRM', webhookUrl: 'https://your-crm.com/api/dealer-lead' } }
            ],
            edges: [
                { id: 'e1', source: 'trigger-1', target: 'ai-1', animated: true },
                { id: 'e2', source: 'ai-1', target: 'action-1', animated: true },
                { id: 'e3', source: 'action-1', target: 'action-2', animated: true }
            ]
        }
    },
    {
        name: 'Dealer Onboarding',
        description: 'Welcome new dealers with an onboarding sequence and VIP tag.',
        category: 'dealer',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'TAG_ADDED', label: 'Tag "dealer" Added' } },
                { id: 'action-1', type: 'action', position: { x: 250, y: 240 }, data: { actionType: 'SEND_WHATSAPP', label: 'Send Welcome', messageContent: 'Welcome to our dealer network, {{contact.firstName}}! 🎉 Our team will contact you within 24 hours.' } },
                { id: 'delay-1', type: 'delay', position: { x: 250, y: 400 }, data: { label: 'Wait 24 hours', delayMinutes: 1440 } },
                { id: 'action-2', type: 'action', position: { x: 250, y: 560 }, data: { actionType: 'SEND_WHATSAPP', label: 'Follow Up', messageContent: 'Hi {{contact.firstName}}, just checking in! Have you had a chance to review our catalog? Reply YES to proceed. 😊' } }
            ],
            edges: [
                { id: 'e1', source: 'trigger-1', target: 'action-1', animated: true },
                { id: 'e2', source: 'action-1', target: 'delay-1', animated: true },
                { id: 'e3', source: 'delay-1', target: 'action-2', animated: true }
            ]
        }
    },

    // ── Campaign Follow-up ─────────────────────────
    {
        name: 'Campaign No-Reply Re-engage',
        description: 'Re-engage contacts who did not respond to a campaign broadcast after 48 hours.',
        category: 'campaign',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'CONTACT_CREATED', label: 'Contact Added to Campaign' } },
                { id: 'delay-1', type: 'delay', position: { x: 250, y: 240 }, data: { label: 'Wait 48 hours', delayMinutes: 2880 } },
                { id: 'action-1', type: 'action', position: { x: 250, y: 400 }, data: { actionType: 'SEND_WHATSAPP', label: 'Re-engage Message', messageContent: 'Hi {{contact.firstName}}! We noticed you haven\'t replied yet. Need any help? We are here 👋' } }
            ],
            edges: [
                { id: 'e1', source: 'trigger-1', target: 'delay-1', animated: true },
                { id: 'e2', source: 'delay-1', target: 'action-1', animated: true }
            ]
        }
    },
    {
        name: 'Post-Campaign Survey',
        description: 'Send a satisfaction survey to all contacts after a campaign completes.',
        category: 'campaign',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'MESSAGE_RECEIVED', label: 'Message Received' } },
                { id: 'action-1', type: 'action', position: { x: 250, y: 240 }, data: { actionType: 'SEND_WHATSAPP', label: 'Send Survey', messageContent: 'Thank you for engaging with us! 🙏 Rate your experience: Reply 1 (Poor), 2 (Okay), 3 (Good), 4 (Great), 5 (Excellent)' } },
                { id: 'action-2', type: 'action', position: { x: 250, y: 400 }, data: { actionType: 'ADD_TAG', label: 'Tag Survey Sent', tagName: 'survey-sent' } }
            ],
            edges: [
                { id: 'e1', source: 'trigger-1', target: 'action-1', animated: true },
                { id: 'e2', source: 'action-1', target: 'action-2', animated: true }
            ]
        }
    },

    // ── Appointment Booking ────────────────────────
    {
        name: 'Appointment Confirmation',
        description: 'Confirm appointments and send 24-hour reminders automatically.',
        category: 'appointment',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'TAG_ADDED', label: 'Tag "appointment-booked" Added' } },
                { id: 'action-1', type: 'action', position: { x: 250, y: 240 }, data: { actionType: 'SEND_WHATSAPP', label: 'Confirm Appointment', messageContent: 'Hi {{contact.firstName}}! Your appointment has been confirmed. ✅ We will send a reminder 24 hours before.' } },
                { id: 'delay-1', type: 'delay', position: { x: 250, y: 400 }, data: { label: 'Wait until 24h before', delayMinutes: 1380 } },
                { id: 'action-2', type: 'action', position: { x: 250, y: 560 }, data: { actionType: 'SEND_WHATSAPP', label: 'Reminder', messageContent: '⏰ Reminder: Your appointment is tomorrow! Reply CONFIRM to confirm or CANCEL to reschedule.' } }
            ],
            edges: [
                { id: 'e1', source: 'trigger-1', target: 'action-1', animated: true },
                { id: 'e2', source: 'action-1', target: 'delay-1', animated: true },
                { id: 'e3', source: 'delay-1', target: 'action-2', animated: true }
            ]
        }
    },
    {
        name: 'No-Show Re-schedule',
        description: 'Automatically follow up with contacts who miss their appointment.',
        category: 'appointment',
        requiredVariables: [],
        flowDefinition: {
            nodes: [
                { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 80 }, data: { triggerType: 'TAG_ADDED', label: 'Tag "no-show" Added' } },
                { id: 'action-1', type: 'action', position: { x: 250, y: 240 }, data: { actionType: 'SEND_WHATSAPP', label: 'Missed Appointment', messageContent: 'Hi {{contact.firstName}}, we noticed you missed your appointment. Would you like to reschedule? Reply YES and we will get you sorted! 😊' } },
                { id: 'action-2', type: 'action', position: { x: 250, y: 400 }, data: { actionType: 'ADD_TAG', label: 'Tag Rescheduling', tagName: 'needs-reschedule' } }
            ],
            edges: [
                { id: 'e1', source: 'trigger-1', target: 'action-1', animated: true },
                { id: 'e2', source: 'action-1', target: 'action-2', animated: true }
            ]
        }
    }
];

async function main() {
    console.log('Seeding automation templates...');

    for (const t of TEMPLATES) {
        await prisma.automationTemplate.upsert({
            where: { id: t.name.replace(/\s+/g, '-').toLowerCase() },
            update: {
                name: t.name,
                description: t.description,
                category: t.category,
                flowDefinition: t.flowDefinition as any,
                requiredVariables: t.requiredVariables,
            },
            create: {
                id: t.name.replace(/\s+/g, '-').toLowerCase(),
                name: t.name,
                description: t.description,
                category: t.category,
                flowDefinition: t.flowDefinition as any,
                requiredVariables: t.requiredVariables,
                isBuiltIn: true,
            }
        });
        console.log(`  ✓ ${t.name}`);
    }

    console.log(`\nSeeded ${TEMPLATES.length} templates successfully!`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
