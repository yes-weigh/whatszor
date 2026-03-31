import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';

const log = createLogger({ module: 'template.service' });

export async function listTemplates(category?: string) {
    return prisma.automationTemplate.findMany({
        where: category ? { category } : undefined,
        orderBy: { createdAt: 'asc' }
    });
}

export async function getTemplate(id: string) {
    const template = await prisma.automationTemplate.findUnique({ where: { id } });
    if (!template) throw new Error('Template not found');
    return template;
}

export async function installTemplate(workspaceId: string, templateId: string) {
    const template = await getTemplate(templateId);

    log.info({ workspaceId, templateId }, 'Installing template into workspace');

    // Clone the template flowDefinition into a new AutomationRule for this workspace
    const rule = await prisma.automationRule.create({
        data: {
            workspaceId,
            name: template.name,
            description: template.description,
            trigger: { type: 'CONTACT_CREATED' }, // Will be overridden by the flow editor
            conditions: [],
            actions: [],
            flowDefinition: template.flowDefinition as any,
            status: 'DRAFT',
            isActive: false,
        }
    });

    return { rule, template };
}
