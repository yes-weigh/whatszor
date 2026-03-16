import { prisma } from '../../prisma/client';
import type { CreatePipelineInput, UpdatePipelineInput } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';

export async function createPipeline(workspaceId: string, input: CreatePipelineInput) {
    return prisma.pipeline.create({
        data: {
            workspaceId,
            name: input.name,
            ...(input.description && { description: input.description }),
        },
    });
}

export async function listPipelines(workspaceId: string) {
    return prisma.pipeline.findMany({
        where: { workspaceId },
        include: {
            stages: { orderBy: { order: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
    });
}

export async function getPipeline(workspaceId: string, pipelineId: string) {
    const pipeline = await prisma.pipeline.findUnique({
        where: { id: pipelineId, workspaceId },
        include: {
            stages: { orderBy: { order: 'asc' } },
        },
    });
    if (!pipeline) throw createError('Pipeline not found', ErrorCodes.NOT_FOUND, 404);
    return pipeline;
}

export async function updatePipeline(
    workspaceId: string,
    pipelineId: string,
    input: UpdatePipelineInput
) {
    await getPipeline(workspaceId, pipelineId);

    return prisma.pipeline.update({
        where: { id: pipelineId },
        data: {
            ...(input.name && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
        },
    });
}

export async function deletePipeline(workspaceId: string, pipelineId: string) {
    await getPipeline(workspaceId, pipelineId);
    await prisma.pipeline.delete({ where: { id: pipelineId } });
}

function createError(message: string, code: string, statusCode: number) {
    const err = new Error(message) as Error & { code: string; statusCode: number };
    err.code = code;
    err.statusCode = statusCode;
    return err;
}
