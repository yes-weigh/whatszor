import { prisma } from '../../prisma/client';
import { CreateAutomationRuleInput, UpdateAutomationRuleInput } from '@whatszor/shared';
import { systemEventsQueue } from '../../core/queue';

export async function getRules(workspaceId: string) {
    return prisma.automationRule.findMany({
        where: { workspaceId },
        include: {
            _count: {
                select: { executions: true }
            }
        },
        orderBy: { updatedAt: 'desc' }
    });
}

export async function createRule(workspaceId: string, input: CreateAutomationRuleInput) {
    return prisma.automationRule.create({
        data: {
            workspaceId,
            name: input.name,
            description: input.description,
            eventType: input.eventType,
            isActive: input.isActive ?? true,
            trigger: input.trigger || {},
            conditions: input.conditions || [],
            actions: input.actions as any || [],
            flowDefinition: input.flowDefinition ? (input.flowDefinition as any) : undefined,
            status: 'DRAFT',
        }
    });
}

export async function getRule(workspaceId: string, id: string) {
    const rule = await prisma.automationRule.findFirst({
        where: { id, workspaceId }
    });
    if (!rule) {
        throw new Error('Automation rule not found');
    }
    return rule;
}

export async function updateRule(workspaceId: string, id: string, input: UpdateAutomationRuleInput) {
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.status !== undefined) data.status = input.status;
    if (input.eventType !== undefined) data.eventType = input.eventType;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.trigger !== undefined) data.trigger = input.trigger as any;
    if (input.conditions !== undefined) data.conditions = input.conditions as any;
    if (input.actions !== undefined) data.actions = input.actions as any;
    if (input.flowDefinition !== undefined) data.flowDefinition = input.flowDefinition as any;

    const rules = await prisma.automationRule.updateMany({
        where: { id, workspaceId },
        data
    });
    return rules.count > 0;
}

export async function deleteRule(workspaceId: string, id: string) {
    return prisma.automationRule.deleteMany({
        where: { id, workspaceId }
    });
}

// Debugging APIs

export async function getRuleExecutions(workspaceId: string, ruleId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    
    // Verify rule matches workspace
    const rule = await getRule(workspaceId, ruleId);

    const [executions, total] = await Promise.all([
        prisma.automationExecution.findMany({
            where: { ruleId: rule.id, workspaceId },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        }),
        prisma.automationExecution.count({
            where: { ruleId: rule.id, workspaceId }
        })
    ]);

    return { executions, total, page, limit };
}

export async function getExecutionLogs(workspaceId: string, ruleId: string, executionId: string) {
    // Verify rule matches workspace
    await getRule(workspaceId, ruleId);

    const logs = await prisma.nodeExecutionLog.findMany({
        where: { executionId },
        orderBy: { startedAt: 'asc' }
    });
    
    const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId }
    });

    return { execution, logs };
}

export async function simulateRule(workspaceId: string, ruleId: string, testPayload: any = {}) {
    const rule = await getRule(workspaceId, ruleId);

    if (!rule.isActive) {
        throw new Error('Cannot simulate an inactive rule. Please activate it first.');
    }

    if (!rule.eventType) {
         throw new Error('Rule does not have an Event Type subscribed.');
    }

    // Default simulation payload scaffolding
    const payload = {
        eventType: rule.eventType,
        workspaceId,
        source: 'simulator',
        payload: {
            ...testPayload,
            simulated: true
        }
    };

    const job = await systemEventsQueue.add(`sim-${ruleId}-${Date.now()}`, payload);
    return { jobId: job.id, message: 'Simulation event dispatched to the System Events Queue.' };
}
