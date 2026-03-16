import { prisma } from '../../prisma/client';
import type { CreateContactInput, UpdateContactInput } from '@whatszor/shared';
import { ErrorCodes } from '@whatszor/shared';
import { Prisma } from '@prisma/client';
import { logEvent } from '../../core/event-logger';

export async function createContact(workspaceId: string, input: CreateContactInput) {
    // Check unique constraints if provided
    if (input.email) {
        const existing = await prisma.contact.findUnique({
            where: { workspaceId_email: { workspaceId, email: input.email } },
        });
        if (existing) throw createError('Email already exists in this workspace', ErrorCodes.CONFLICT, 409);
    }
    if (input.phone) {
        const existing = await prisma.contact.findUnique({
            where: { workspaceId_phone: { workspaceId, phone: input.phone } },
        });
        if (existing) throw createError('Phone already exists in this workspace', ErrorCodes.CONFLICT, 409);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customData = input.customData ? (input.customData as any) : Prisma.DbNull;

    const contact = await prisma.contact.create({
        data: {
            workspaceId,
            firstName: input.firstName,
            ...(input.lastName && { lastName: input.lastName }),
            ...(input.email && { email: input.email }),
            ...(input.phone && { phone: input.phone }),
            ...(input.orgId && { orgId: input.orgId }),
            customData,
        },
    });

    // Log global event
    await logEvent(workspaceId, 'contact_created', 'crm_module', {
        contactId: contact.id,
        phone: contact.phone,
        email: contact.email
    });

    return contact;
}

export async function listContacts(workspaceId: string, opts?: { search?: string; limit?: number }) {
    const { search, limit } = opts ?? {};
    return prisma.contact.findMany({
        where: {
            workspaceId,
            ...(search && {
                OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ],
            }),
        },
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        ...(limit && { take: limit }),
    });
}

export async function getContact(workspaceId: string, contactId: string) {
    const contact = await prisma.contact.findUnique({
        where: { id: contactId, workspaceId },
        include: { organization: { select: { id: true, name: true } } },
    });
    if (!contact) throw createError('Contact not found', ErrorCodes.NOT_FOUND, 404);
    return contact;
}

export async function updateContact(workspaceId: string, contactId: string, input: UpdateContactInput) {
    // Check existence first to ensure it belongs to the workspace
    await getContact(workspaceId, contactId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customData = input.customData ? (input.customData as any) : undefined;

    const updatedContact = await prisma.contact.update({
        where: { id: contactId },
        data: {
            ...(input.firstName && { firstName: input.firstName }),
            ...(input.lastName !== undefined && { lastName: input.lastName }),
            ...(input.email !== undefined && { email: input.email }),
            ...(input.phone !== undefined && { phone: input.phone }),
            ...(input.orgId !== undefined && { orgId: input.orgId }),
            ...(customData && { customData }),
        },
    });

    // Log global event
    await logEvent(workspaceId, 'contact_updated', 'crm_module', {
        contactId: updatedContact.id,
        phone: updatedContact.phone,
        email: updatedContact.email,
        updatedFields: Object.keys(input)
    });

    return updatedContact;
}

export async function deleteContact(workspaceId: string, contactId: string) {
    await getContact(workspaceId, contactId);
    await prisma.contact.delete({ where: { id: contactId } });
}

function createError(message: string, code: string, statusCode: number) {
    const err = new Error(message) as Error & { code: string; statusCode: number };
    err.code = code;
    err.statusCode = statusCode;
    return err;
}
