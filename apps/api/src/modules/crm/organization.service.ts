import { prisma } from '../../prisma/client';
import type { CreateOrganizationInput, UpdateOrganizationInput } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';
import { Prisma } from '@prisma/client';

export async function createOrganization(workspaceId: string, input: CreateOrganizationInput) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customData = input.customData ? (input.customData as any) : Prisma.DbNull;

    return prisma.organization.create({
        data: {
            workspaceId,
            name: input.name,
            ...(input.website && { website: input.website }),
            ...(input.industry && { industry: input.industry }),
            customData,
        },
    });
}

export async function listOrganizations(workspaceId: string) {
    return prisma.organization.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
    });
}

export async function getOrganization(workspaceId: string, orgId: string) {
    const org = await prisma.organization.findUnique({
        where: { id: orgId, workspaceId },
        include: {
            contacts: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
    });
    if (!org) throw createError('Organization not found', ErrorCodes.NOT_FOUND, 404);
    return org;
}

export async function updateOrganization(
    workspaceId: string,
    orgId: string,
    input: UpdateOrganizationInput
) {
    await getOrganization(workspaceId, orgId); // ensures ownership

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customData = input.customData ? (input.customData as any) : undefined;

    return prisma.organization.update({
        where: { id: orgId },
        data: {
            ...(input.name && { name: input.name }),
            ...(input.website !== undefined && { website: input.website }),
            ...(input.industry !== undefined && { industry: input.industry }),
            ...(customData && { customData }),
        },
    });
}

export async function deleteOrganization(workspaceId: string, orgId: string) {
    await getOrganization(workspaceId, orgId);
    await prisma.organization.delete({ where: { id: orgId } });
}

function createError(message: string, code: string, statusCode: number) {
    const err = new Error(message) as Error & { code: string; statusCode: number };
    err.code = code;
    err.statusCode = statusCode;
    return err;
}
