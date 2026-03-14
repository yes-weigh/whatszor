import { prisma } from '../../prisma/client';

/**
 * Creates a new Audience segment for a workspace.
 */
export async function createAudience(workspaceId: string, data: { name: string; description?: string }) {
    return prisma.audience.create({
        data: {
            workspaceId,
            name: data.name,
            description: data.description,
        },
    });
}

/**
 * Lists audiences with pagination and contact counts.
 */
export async function listAudiences(workspaceId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
        prisma.audience.findMany({
            where: { workspaceId },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.audience.count({ where: { workspaceId } }),
    ]);

    return { items, total, page, limit };
}

/**
 * Updates an audience name or description.
 */
export async function updateAudience(workspaceId: string, id: string, data: { name?: string; description?: string }) {
    return prisma.audience.update({
        where: { id, workspaceId },
        data,
    });
}

/**
 * Deletes an audience entirely.
 */
export async function deleteAudience(workspaceId: string, id: string) {
    // Delete the audience. Cascade will handle removing AudienceMember links.
    const deleted = await prisma.audience.delete({
        where: { id, workspaceId },
    });

    // Audit Logger
    await prisma.eventLog.create({
        data: {
            workspaceId,
            eventType: 'audience_deleted',
            sourceModule: 'audience_service',
            payloadMetadata: { audienceId: id, name: deleted.name },
        },
    });

    return deleted;
}

/**
 * Adds multiple contacts to an audience.
 * Enforces contactCount consistency by running in a transaction.
 */
export async function addContactsToAudience(workspaceId: string, audienceId: string, contactIds: string[]) {
    // 1. Verify Audience belongs to workspace
    const audience = await prisma.audience.findUnique({
        where: { id: audienceId, workspaceId },
    });
    if (!audience) throw new Error('Audience not found');

    // 2. Verify all contacts actually belong to the workspace
    const validContacts = await prisma.contact.findMany({
        where: { id: { in: contactIds }, workspaceId },
        select: { id: true },
    });

    const validIds = validContacts.map(c => c.id);
    if (validIds.length === 0) return { added: 0 };

    // 3. Insert ignoring duplicates and increment counter transactionally
    const result = await prisma.$transaction(async (tx) => {
        const payload = validIds.map(id => ({
            audienceId,
            contactId: id,
        }));

        const createRes = await tx.audienceMember.createMany({
            data: payload,
            skipDuplicates: true,
        });

        if (createRes.count > 0) {
            await tx.audience.update({
                where: { id: audienceId },
                data: { contactCount: { increment: createRes.count } },
            });
        }

        return createRes.count;
    });

    // Audit Logger
    await prisma.eventLog.create({
        data: {
            workspaceId,
            eventType: 'audience_contacts_added',
            sourceModule: 'audience_service',
            payloadMetadata: { audienceId, count: result },
        },
    });

    return { added: result };
}

/**
 * Removes a single contact from an audience.
 */
export async function removeContactFromAudience(workspaceId: string, audienceId: string, contactId: string) {
    // The query safely anchors against the Contact's workspaceId to prevent cross-tenant removal
    const contact = await prisma.contact.findUnique({
        where: { id: contactId, workspaceId },
    });

    if (!contact) throw new Error('Contact not found or does not belong to workspace');

    const result = await prisma.$transaction(async (tx) => {
        const deleted = await tx.audienceMember.deleteMany({
            where: { audienceId, contactId },
        });

        if (deleted.count > 0) {
            await tx.audience.update({
                where: { id: audienceId, workspaceId },
                data: { contactCount: { decrement: 1 } },
            });
        }
        return deleted.count;
    });

    if (result > 0) {
        await prisma.eventLog.create({
            data: {
                workspaceId,
                eventType: 'audience_contacts_removed',
                sourceModule: 'audience_service',
                payloadMetadata: { audienceId, count: 1 },
            },
        });
    }

    return { removed: result };
}
