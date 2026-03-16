import { prisma } from '../../prisma/client';
import type { CreateStageInput, UpdateStageInput } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';
import { getPipeline } from './pipeline.service';

export async function createStage(workspaceId: string, input: CreateStageInput) {
    // Ensure the pipeline belongs to the workspace
    await getPipeline(workspaceId, input.pipelineId);

    return prisma.stage.create({
        data: {
            pipelineId: input.pipelineId,
            name: input.name,
            order: input.order,
        },
    });
}

// Stage updates usually involve renaming or changing the display order
export async function updateStage(
    workspaceId: string,
    stageId: string,
    input: UpdateStageInput
) {
    const stage = await prisma.stage.findUnique({
        where: { id: stageId },
        include: { pipeline: true },
    });

    if (!stage) throw createError('Stage not found', ErrorCodes.NOT_FOUND, 404);
    if (stage.pipeline.workspaceId !== workspaceId) {
        throw createError('Stage not found', ErrorCodes.NOT_FOUND, 404); // keep it vague for security
    }

    // If changing pipeline, check the new pipeline ownership
    if (input.pipelineId && input.pipelineId !== stage.pipelineId) {
        await getPipeline(workspaceId, input.pipelineId);
    }

    return prisma.stage.update({
        where: { id: stageId },
        data: {
            ...(input.pipelineId && { pipelineId: input.pipelineId }),
            ...(input.name && { name: input.name }),
            ...(input.order !== undefined && { order: input.order }),
        },
    });
}

export async function deleteStage(workspaceId: string, stageId: string) {
    const stage = await prisma.stage.findUnique({
        where: { id: stageId },
        include: { pipeline: true },
    });

    if (!stage || stage.pipeline.workspaceId !== workspaceId) {
        throw createError('Stage not found', ErrorCodes.NOT_FOUND, 404);
    }

    await prisma.stage.delete({ where: { id: stageId } });
}

function createError(message: string, code: string, statusCode: number) {
    const err = new Error(message) as Error & { code: string; statusCode: number };
    err.code = code;
    err.statusCode = statusCode;
    return err;
}
