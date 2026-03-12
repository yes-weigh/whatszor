// @ts-nocheck
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting migration of legacy automation rules to Event-Driven Graph format...');

    // Find rules that haven't been migrated to eventType yet
    const rules = await prisma.automationRule.findMany({
        where: {
            // @ts-ignore
            eventType: null
        }
    });

    console.log(`Found ${rules.length} legacy rules to migrate.`);

    for (const rule of rules) {
        try {
            const actions: any = rule.actions || [];
            
            if (!Array.isArray(actions) || actions.length === 0) {
                console.log(`Rule ${rule.id} has no legacy actions. Updating event metadata.`);
                
                await prisma.automationRule.update({
                    where: { id: rule.id },
                    data: {
                        eventType: 'message_received',
                        isActive: true,
                        // Initialize empty graph if null
                        flowDefinition: rule.flowDefinition || { nodes: [], edges: [] } as any
                    }
                });
                continue;
            }

            // Convert older linear action arrays into xyflow graph format
            const nodes: any[] = [];
            const edges: any[] = [];
            
            const timestamp = Date.now().toString(36);

            // 1. Create a Trigger Node (Event Bus Subscriber equivalent node)
            const triggerId = `trigger-legacy-${timestamp}`;
            nodes.push({
                id: triggerId,
                type: 'trigger',
                position: { x: 250, y: 100 },
                data: {
                    label: 'Incoming WhatsApp Message',
                    description: 'Triggered when a message is received on this Workspace',
                    eventType: 'message_received'
                }
            });

            let previousNodeId = triggerId;
            let currentY = 250;

            // 2. Map Actions to generic Flow Action Nodes
            actions.forEach((action, i) => {
                const nodeId = `node-legacy-${i}-${timestamp}`;
                let label = 'Action';
                
                if (action.type === 'SEND_WHATSAPP') label = 'Send Message';
                if (action.type === 'DELAY') label = 'Time Delay';
                if (action.type === 'WEBHOOK') label = 'HTTP Webhook';
                if (action.type === 'ADD_TAG') label = 'Assign Tag';

                nodes.push({
                    id: nodeId,
                    type: 'action', // Ensure we use custom Flow builder action components
                    position: { x: 250, y: currentY },
                    data: {
                        label,
                        // Map legacy payloads transparently into the node data schema
                        actionType: action.type,
                        messageContent: action.messageContent || '',
                        templateId: action.templateId || null,
                        delayMinutes: action.minutes ? action.minutes.toString() : '1',
                        webhookUrl: action.webhookUrl || ''
                    }
                });

                edges.push({
                    id: `edge-${previousNodeId}-${nodeId}`,
                    source: previousNodeId,
                    target: nodeId,
                    type: 'smoothstep'
                });

                previousNodeId = nodeId;
                currentY += 150;
            });

            const newFlowDefinition = { nodes, edges };

            // Apply Update
            await prisma.automationRule.update({
                where: { id: rule.id },
                data: {
                    flowDefinition: newFlowDefinition as any,
                    eventType: 'message_received',
                    isActive: true
                }
            });

            console.log(`Successfully migrated Rule ${rule.id} to Flow Graph (${nodes.length} nodes, ${edges.length} edges).`);
        } catch (err: any) {
            console.error(`Failed to migrate rule ${rule.id}:`, err.message);
        }
    }

    console.log('Migration complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
