import { prisma } from '../../prisma/client';
import type { CreateRecordInput, UpdateRecordInput } from '@yesbheem/shared';
import { ErrorCodes } from '@yesbheem/shared';
import { Prisma } from '$prisma/client';

export async function createRecord(workspaceId: string, input: CreateRecordInput) {
    // Ensure pipeline and stage belong to the workspace
    const stage = await prisma.stage.findUnique({
        where: { id: input.stageId },
        include: { pipeline: true },
    });

    if (!stage) throw createError('Stage not found', ErrorCodes.NOT_FOUND, 404);
    if (stage.pipelineId !== input.pipelineId || stage.pipeline.workspaceId !== workspaceId) {
        throw createError('Invalid pipeline or stage', ErrorCodes.BAD_REQUEST, 400);
    }

    // Ensure contact/org belong to the workspace if provided
    if (input.contactId) {
        const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
        if (contact?.workspaceId !== workspaceId) throw createError('Contact not found', ErrorCodes.NOT_FOUND, 404);
    }
    if (input.orgId) {
        const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
        if (org?.workspaceId !== workspaceId) throw createError('Organization not found', ErrorCodes.NOT_FOUND, 404);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customData = input.customData ? (input.customData as any) : Prisma.DbNull;

    return prisma.record.create({
        data: {
            workspaceId,
            pipelineId: input.pipelineId,
            stageId: input.stageId,
            contactId: input.contactId ?? null,
            orgId: input.orgId ?? null,
            title: input.title,
            value: input.value !== undefined ? input.value : null,
            currency: input.currency ?? 'USD',
            status: input.status ?? 'OPEN',
            customData,
        },
    });
}

export async function listRecords(workspaceId: string, pipelineId?: string) {
    return prisma.record.findMany({
        where: {
            workspaceId,
            ...(pipelineId && { pipelineId }),
        },
        include: {
            contact: { select: { id: true, firstName: true, lastName: true } },
            organization: { select: { id: true, name: true } },
            stage: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
}

export async function getRecord(workspaceId: string, recordId: string) {
    const record = await prisma.record.findUnique({
        where: { id: recordId, workspaceId },
        include: {
            contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
            organization: { select: { id: true, name: true } },
            stage: { select: { id: true, name: true } },
            pipeline: { select: { id: true, name: true } },
        },
    });
    if (!record) throw createError('Record not found', ErrorCodes.NOT_FOUND, 404);
    return record;
}

export async function updateRecord(workspaceId: string, recordId: string, input: UpdateRecordInput) {
    await getRecord(workspaceId, recordId); // verify ownership

    // If moving stage, verify new stage
    if (input.stageId) {
        const stage = await prisma.stage.findUnique({
            where: { id: input.stageId },
            include: { pipeline: true },
        });
        if (!stage || stage.pipeline.workspaceId !== workspaceId) {
            throw createError('Invalid stage', ErrorCodes.BAD_REQUEST, 400);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customData = input.customData ? (input.customData as any) : undefined;

    return prisma.record.update({
        where: { id: recordId },
        data: {
            ...(input.pipelineId && { pipelineId: input.pipelineId }),
            ...(input.stageId && { stageId: input.stageId }),
            ...(input.contactId !== undefined && { contactId: input.contactId }),
            ...(input.orgId !== undefined && { orgId: input.orgId }),
            ...(input.title && { title: input.title }),
            ...(input.value !== undefined && { value: input.value !== null ? input.value : null }),
            ...(input.currency && { currency: input.currency }),
            ...(input.status && { status: input.status }),
            ...(customData && { customData }),
        },
    });
}

export async function deleteRecord(workspaceId: string, recordId: string) {
    await getRecord(workspaceId, recordId);
    await prisma.record.delete({ where: { id: recordId } });
}

function createError(message: string, code: string, statusCode: number) {
    const err = new Error(message) as Error & { code: string; statusCode: number };
    err.code = code;
    err.statusCode = statusCode;
    return err;
}
