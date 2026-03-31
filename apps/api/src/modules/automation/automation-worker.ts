/**
 * Automation Worker — CANONICAL IMPLEMENTATION
 *
 * This is the single, merged automation execution engine.
 * It replaces TWO previously conflicting workers:
 *   1. The inline `automationWorker` in core/queue.ts (had full graph engine but was racing)
 *   2. The scaffold in modules/automation/automation-worker.ts (only handled SEND_TEMPLATE)
 *
 * Supports both execution modes:
 *   - Graph-based (flowDefinition.nodes) — node-by-node step with DELAY, CONDITION, WEBHOOK, AI_REPLY
 *   - Legacy linear (rule.actions array) — used by older rules without flowDefinition
 *
 * Concurrency: 5
 */
import { Job } from 'bullmq';
import { GoogleGenAI } from '@google/genai';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';
import { logEvent } from '../../core/event-logger';
import { getQueue, QueueName } from '../../queues';
import { parseVariables, evaluateConditions } from '../../core/automation-helpers';
import { createOrGetConversation } from '../messaging/conversation.service';
import { composeAndQueueMessage } from '../../core/messaging/message-composer';
import { env } from '../../env';

const log = createLogger({ module: 'worker:automation' });

export async function processAutomationJob(job: Job): Promise<void> {
    const { executionId, ruleId, contactId, stepIndex } = job.data;
    log.info({ executionId, stepIndex }, 'Executing automation step');

    const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
        include: { rule: true },
    });

    if (!execution || execution.status !== 'RUNNING') return;

    const contact = contactId
        ? await prisma.contact.findUnique({ where: { id: contactId } })
        : null;

    const triggerPayload = (execution.triggerEvent as any)?.payload || {};
    const context = {
        contact,
        rule: execution.rule,
        event: {
            ...(execution.triggerEvent as any || {}),
            content: triggerPayload.content || '',
            sessionId: triggerPayload.sessionId || '',
        },
    };

    const flowDef: any = execution.rule.flowDefinition;
    let currentAction: any;
    let isGraph = false;
    let executedNodeId: string | null = null;
    let nextNodeId: string | null = null;

    if (flowDef?.nodes?.length > 0) {
        isGraph = true;
        executedNodeId = job.data.currentNodeId;

        if (!executedNodeId) {
            const trigger = flowDef.nodes.find((n: any) => n.type === 'trigger');
            if (!trigger) return;
            const edge = flowDef.edges.find((e: any) => e.source === trigger.id);
            if (!edge) {
                await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'COMPLETED' } });
                return;
            }
            executedNodeId = edge.target;
        }

        const node = flowDef.nodes.find((n: any) => n.id === executedNodeId);
        if (!node) {
            await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'COMPLETED' } });
            return;
        }

        const actionType = node.data?.actionType || (node.type === 'condition' ? 'CONDITION' : null);
        currentAction = {
            type: actionType,
            minutes: parseInt(node.data?.delayMinutes || '1', 10),
            tagValue: node.data?.tagValue,
            webhookUrl: node.data?.webhookUrl,
            messageContent: node.data?.messageContent,
            sessionId: node.data?.sessionId,
            templateVersionId: node.data?.templateVersionId,
            templateId: node.data?.templateId,
            conditions: node.data?.conditions || [],
        };

        const outEdges = flowDef.edges.filter((e: any) => e.source === executedNodeId);

        if (currentAction.type === 'CONDITION') {
            const condLogic = node.data?.conditionLogic || 'AND';
            const isTrue = evaluateConditions(currentAction.conditions, context, condLogic);
            const handle = isTrue ? 'true' : 'false';
            const branchEdge = outEdges.find((e: any) => e.sourceHandle === handle);
            if (branchEdge) nextNodeId = branchEdge.target;
        } else {
            if (outEdges.length > 0) nextNodeId = outEdges[0].target;
        }
    } else {
        // Legacy linear execution
        const actions = execution.rule.actions as any[];
        if (stepIndex >= actions.length) {
            await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'COMPLETED' } });
            return;
        }
        currentAction = actions[stepIndex];
    }

    const nextJobData: any = { executionId, ruleId, contactId };
    if (isGraph) {
        nextJobData.currentNodeId = nextNodeId;
    } else {
        nextJobData.stepIndex = stepIndex + 1;
    }

    const nodeStartTime = Date.now();

    try {
        switch (currentAction.type) {
            case 'SEND_WHATSAPP': {
                const contactForMsg = contactId
                    ? await prisma.contact.findUnique({ where: { id: contactId } })
                    : null;
                const conversationId = triggerPayload?.conversationId;
                const conversation = conversationId
                    ? await prisma.conversation.findUnique({ where: { id: conversationId } })
                    : null;
                const recipientJid = contactForMsg?.phone || conversation?.providerId;

                if (recipientJid) {
                    const targetConversation = await createOrGetConversation(execution.rule.workspaceId, {
                        provider: 'WHATSAPP',
                        providerId: recipientJid,
                    });

                    const msg = await prisma.message.create({
                        data: {
                            conversationId: targetConversation.id,
                            workspaceId: execution.rule.workspaceId,
                            direction: 'OUTBOUND',
                            type: currentAction.templateId ? 'TEMPLATE' : 'TEXT',
                            content: parseVariables(currentAction.messageContent || execution.rule.name, context),
                            status: 'QUEUED',
                            senderUserId: 'AUTOMATION',
                        },
                    });

                    const targetSessionId = currentAction.sessionId || triggerPayload?.sessionId || execution.rule.workspaceId;
                    await getQueue(QueueName.OUTBOUND_MESSAGES).add(`send-${msg.id}`, {
                        workspaceId: execution.rule.workspaceId,
                        sessionId: targetSessionId,
                        messageId: msg.id,
                        toJid: recipientJid,
                        type: msg.type,
                        content: msg.content,
                        mediaData: { buttons: null },
                    });
                } else {
                    log.warn({ executionId, contactId }, 'SEND_WHATSAPP: no recipient JID found, skipping');
                }
                break;
            }

            case 'SEND_TEMPLATE': {
                // Template-based send (newer nodes using templateVersionId)
                const templateVersionId = currentAction.templateVersionId;
                if (!templateVersionId) {
                    log.warn({ executionId }, 'SEND_TEMPLATE missing templateVersionId');
                    break;
                }
                if (!contact?.phone) {
                    log.warn({ executionId }, 'Contact missing phone for SEND_TEMPLATE');
                    break;
                }

                const targetConv = await createOrGetConversation(execution.rule.workspaceId, {
                    provider: 'WHATSAPP',
                    providerId: contact.phone,
                });

                await composeAndQueueMessage({
                    workspaceId: execution.workspaceId || execution.rule.workspaceId,
                    conversationId: targetConv.id,
                    provider: 'WHATSAPP',
                    providerId: contact.phone,
                    templateVersionId,
                    templateVariables: {
                        contact: contact.customData as any,
                        event: execution.triggerEvent as any,
                        ...(execution.context as Record<string, any> || {}),
                    },
                });

                await prisma.nodeExecutionLog.create({
                    data: {
                        executionId: execution.id,
                        nodeId: executedNodeId || `step-${stepIndex}`,
                        nodeType: 'SEND_TEMPLATE',
                        status: 'COMPLETED',
                        result: {},
                        durationMs: Date.now() - nodeStartTime,
                    },
                });
                break;
            }

            case 'DELAY': {
                const minutes = currentAction.minutes || 1;
                await prisma.automationExecution.update({
                    where: { id: executionId },
                    data: {
                        status: 'PAUSED',
                        resumeAt: new Date(Date.now() + minutes * 60000),
                        currentStep: isGraph ? stepIndex : stepIndex + 1,
                    },
                });

                if (isGraph) {
                    if (nextNodeId) {
                        await getQueue(QueueName.AUTOMATION).add(
                            `exec-${executionId}-${nextNodeId}`,
                            nextJobData,
                            { delay: minutes * 60000 },
                        );
                    } else {
                        await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'COMPLETED' } });
                    }
                } else {
                    await getQueue(QueueName.AUTOMATION).add(
                        `exec-${executionId}-${stepIndex + 1}`,
                        nextJobData,
                        { delay: minutes * 60000 },
                    );
                }
                return; // Stop current branch here — BullMQ delay handles continuation
            }

            case 'WEBHOOK': {
                if (currentAction.webhookUrl) {
                    try {
                        await fetch(currentAction.webhookUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ executionId, contactId, ruleId }),
                        });
                    } catch (error) {
                        log.error({ error, url: currentAction.webhookUrl }, 'Webhook execution failure');
                    }
                }
                break;
            }

            case 'ADD_TAG': {
                // Future implementation placeholder
                break;
            }

            case 'AI_REPLY': {
                const aiContact = await prisma.contact.findUnique({ where: { id: contactId } });
                if (aiContact?.phone) {
                    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
                    const prompt = parseVariables(currentAction.messageContent || 'Hello', context);

                    const response = await ai.models.generateContent({
                        model: 'gemini-2.0-flash',
                        contents: prompt,
                    });

                    const replyText = response.text;
                    if (replyText) {
                        const aiConversation = await createOrGetConversation(execution.rule.workspaceId, {
                            provider: 'WHATSAPP',
                            providerId: aiContact.phone,
                        });

                        const msg = await prisma.message.create({
                            data: {
                                conversationId: aiConversation.id,
                                workspaceId: execution.rule.workspaceId,
                                direction: 'OUTBOUND',
                                type: 'TEXT',
                                content: replyText,
                                status: 'QUEUED',
                                senderUserId: 'AUTOMATION',
                            },
                        });

                        await getQueue(QueueName.OUTBOUND_MESSAGES).add(`send-${msg.id}`, {
                            workspaceId: execution.rule.workspaceId,
                            messageId: msg.id,
                            toJid: aiContact.phone,
                            type: msg.type,
                            content: msg.content,
                            mediaData: { buttons: null },
                        });
                    }
                }
                break;
            }

            case 'CONDITION': {
                // Condition branching is resolved above via evaluateConditions — no-op here.
                break;
            }
        }

        // Log node execution for graph-based executions
        if (isGraph && executedNodeId) {
            await prisma.nodeExecutionLog.create({
                data: {
                    executionId,
                    nodeId: executedNodeId,
                    nodeType: currentAction.type,
                    status: 'COMPLETED',
                    durationMs: Date.now() - nodeStartTime,
                    result: { nextNodeId },
                },
            });

            await logEvent(execution.rule.workspaceId, 'node_executed', 'automation_engine', {
                executionId, ruleId, contactId, nodeId: executedNodeId,
                nodeType: currentAction.type, status: 'COMPLETED',
                durationMs: Date.now() - nodeStartTime,
            });
        }

        // Queue next step
        if (isGraph) {
            if (nextNodeId) {
                await getQueue(QueueName.AUTOMATION).add(`exec-${executionId}-${nextNodeId}`, nextJobData);
            } else {
                await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'COMPLETED' } });
            }
        } else {
            await prisma.automationExecution.update({ where: { id: executionId }, data: { currentStep: stepIndex + 1 } });
            await getQueue(QueueName.AUTOMATION).add(`exec-${executionId}-${stepIndex + 1}`, nextJobData);
        }

    } catch (err: any) {
        log.error({ err, executionId }, 'Failed to execute automation step');

        if (isGraph && executedNodeId) {
            await prisma.nodeExecutionLog.create({
                data: {
                    executionId,
                    nodeId: executedNodeId,
                    nodeType: currentAction.type,
                    status: 'FAILED',
                    error: err.message,
                    durationMs: Date.now() - nodeStartTime,
                },
            });
            await logEvent(execution.rule.workspaceId, 'node_failed', 'automation_engine', {
                executionId, ruleId, contactId, nodeId: executedNodeId,
                nodeType: currentAction.type, error: err.message,
                durationMs: Date.now() - nodeStartTime,
            });
        }

        await prisma.automationExecution.update({
            where: { id: executionId },
            data: { status: 'FAILED', errorReason: err.message },
        });

        throw err; // Trigger BullMQ retry
    }
}
