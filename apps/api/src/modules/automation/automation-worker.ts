import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { logger } from '../../core/logger';
import { composeAndQueueMessage } from '../../core/messaging/message-composer';

const log = logger.child({ module: 'automation-worker' });

export async function processAutomationJob(job: Job) {
    // This is a simplified scaffold of the automation engine execution loop
    // In a full graph-based engine, this would recursively/iteratively evaluate nodes.
    const { executionId } = job.data;

    log.info({ executionId }, 'Starting automation execution...');

    const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
        include: {
            rule: true,
            contact: true
        }
    });

    if (!execution || !execution.rule) {
        return;
    }

    const actions = execution.rule.actions as any[];
    
    // Resume from current step
    for (let i = execution.currentStep; i < actions.length; i++) {
        const action = actions[i];

        if (action.type === 'SEND_TEMPLATE' || action.actionType === 'SEND_TEMPLATE') {
            const templateVersionId = action.templateVersionId;

            if (!templateVersionId) {
                log.warn({ executionId }, 'SEND_TEMPLATE action missing templateVersionId');
                continue;
            }

            if (!execution.contact?.phone) {
                log.warn({ executionId }, 'Contact missing phone for SEND_TEMPLATE');
                continue;
            }

            try {
                // Route through Universal Message Composer
                const message = await composeAndQueueMessage({
                    workspaceId: execution.workspaceId || execution.rule.workspaceId,
                    conversationId: `auto-${execution.ruleId}-${execution.contactId}`, // Pseudo-resolve conversation
                    provider: 'WHATSAPP',
                    providerId: execution.contact.phone,
                    templateVersionId,
                    templateVariables: {
                        contact: execution.contact.customData as any,
                        event: execution.triggerEvent as any,
                        // Context state built up during automation execution
                        ...(execution.context as Record<string, any> || {})
                    }
                });

                // Log the node execution securely
                await prisma.nodeExecutionLog.create({
                    data: {
                        executionId: execution.id,
                        nodeId: action.id || `step-${i}`,
                        nodeType: 'SEND_TEMPLATE',
                        status: 'COMPLETED',
                        result: { messageId: message.id },
                        durationMs: 0
                    }
                });

            } catch (error: any) {
                log.error({ executionId, err: error }, 'Failed to execute SEND_TEMPLATE node');
                
                await prisma.nodeExecutionLog.create({
                    data: {
                        executionId: execution.id,
                        nodeId: action.id || `step-${i}`,
                        nodeType: 'SEND_TEMPLATE',
                        status: 'FAILED',
                        error: error.message,
                        durationMs: 0
                    }
                });

                // Break automation flow on failure
                await prisma.automationExecution.update({
                    where: { id: execution.id },
                    data: { status: 'FAILED', errorReason: error.message }
                });
                return;
            }
        }

        // Advance state inline
        await prisma.automationExecution.update({
            where: { id: execution.id },
            data: { currentStep: i + 1 }
        });
    }

    await prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'COMPLETED' }
    });

    log.info({ executionId }, 'Automation execution finished.');
}
