/**
 * audience.service.ts
 *
 * Business logic for the Audiences module.
 * Audiences are named, reusable contact segments that can be targeted in campaigns.
 *
 * Key design decisions:
 *  - memberCount is maintained by this service (increment/decrement) for O(1) reads.
 *  - If a leadListId is already linked to an existing Audience, we REUSE it (no duplicates).
 *  - Campaign population snapshots members at creation time — the campaign worker
 *    only reads CampaignMember rows and does NOT query the Audience at send time.
 */

import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';
import { ErrorCodes } from '@whatszor/shared';
import type {
    CreateAudienceInput,
    UpdateAudienceInput,
    AddAudienceMembersInput,
    RemoveAudienceMembersInput,
    ImportLeadListInput,
} from '@whatszor/shared';

const log = createLogger({ module: 'audience-service' });

// ── Helpers ───────────────────────────────────────────────────────────────────

function notFound(id: string): never {
    throw Object.assign(new Error(`Audience ${id} not found`), {
        statusCode: 404,
        code: ErrorCodes.NOT_FOUND,
    });
}

// ── Service Functions ─────────────────────────────────────────────────────────

/**
 * Create a new audience, optionally pre-populating from a contact list or
 * linking to a lead list.
 *
 * Dedup guard: if `leadListId` is provided and another audience is already
 * linked to it in this workspace, we return the existing audience instead of
 * creating a duplicate.
 */
export async function createAudience(workspaceId: string, input: CreateAudienceInput) {
    // ── Dedup guard for lead-list-sourced audiences ──────────────────────────
    if (input.leadListId) {
        const existing = await prisma.audience.findFirst({
            where: { workspaceId, leadListId: input.leadListId },
            include: { _count: { select: { members: true } } },
        });
        if (existing) {
            log.info({ audienceId: existing.id, leadListId: input.leadListId }, 'Reusing existing audience for lead list');
            return existing;
        }
    }

    const audience = await prisma.audience.create({
        data: {
            workspaceId,
            name: input.name,
            description: input.description ?? null,
            sourceType: input.leadListId ? 'lead_list' : 'manual',
            leadListId: input.leadListId ?? null,
            memberCount: 0,
        },
    });

    // Pre-populate from contactIds if provided
    if (input.contactIds && input.contactIds.length > 0) {
        const added = await _addMembers(workspaceId, audience.id, input.contactIds, 'manual');
        await prisma.audience.update({
            where: { id: audience.id },
            data: { memberCount: { increment: added } },
        });
        return prisma.audience.findUniqueOrThrow({ where: { id: audience.id } });
    }

    log.info({ audienceId: audience.id, workspaceId }, 'Audience created');
    return audience;
}

export async function getAudiences(workspaceId: string, skip = 0, take = 50) {
    const [items, total] = await Promise.all([
        prisma.audience.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            skip,
            take,
            select: {
                id: true,
                name: true,
                description: true,
                sourceType: true,
                leadListId: true,
                memberCount: true,
                createdAt: true,
                updatedAt: true,
                leadList: { select: { name: true, query: true } },
                _count: { select: { campaigns: true } },
            },
        }),
        prisma.audience.count({ where: { workspaceId } }),
    ]);
    return { items, total };
}

export async function getAudience(workspaceId: string, audienceId: string) {
    const audience = await prisma.audience.findFirst({
        where: { id: audienceId, workspaceId },
        include: {
            leadList: { select: { id: true, name: true, query: true, status: true } },
            _count: { select: { members: true, campaigns: true } },
        },
    });
    if (!audience) notFound(audienceId);
    return audience;
}

export async function updateAudience(workspaceId: string, audienceId: string, input: UpdateAudienceInput) {
    await getAudience(workspaceId, audienceId);
    return prisma.audience.update({
        where: { id: audienceId },
        data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
        },
    });
}

export async function deleteAudience(workspaceId: string, audienceId: string) {
    await getAudience(workspaceId, audienceId);
    // Unlink campaigns (audienceId will be set to null via onDelete:SetNull).
    await prisma.audience.delete({ where: { id: audienceId } });
    log.info({ audienceId, workspaceId }, 'Audience deleted');
    return { deleted: true };
}

// ── Membership ────────────────────────────────────────────────────────────────

export async function addAudienceMembers(
    workspaceId: string,
    audienceId: string,
    input: AddAudienceMembersInput,
) {
    await getAudience(workspaceId, audienceId);
    const added = await _addMembers(workspaceId, audienceId, input.contactIds, input.sourceType);
    if (added > 0) {
        await prisma.audience.update({
            where: { id: audienceId },
            data: { memberCount: { increment: added } },
        });
    }
    return { added };
}

export async function removeAudienceMembers(
    workspaceId: string,
    audienceId: string,
    input: RemoveAudienceMembersInput,
) {
    await getAudience(workspaceId, audienceId);
    const { count } = await prisma.audienceMember.deleteMany({
        where: { audienceId, contactId: { in: input.contactIds } },
    });
    if (count > 0) {
        await prisma.audience.update({
            where: { id: audienceId },
            data: { memberCount: { decrement: count } },
        });
    }
    return { removed: count };
}

/**
 * List members of an audience with basic contact info.
 */
export async function getAudienceMembers(
    workspaceId: string,
    audienceId: string,
    skip = 0,
    take = 100,
) {
    await getAudience(workspaceId, audienceId);
    const members = await prisma.audienceMember.findMany({
        where: { audienceId },
        skip,
        take,
        select: {
            id: true,
            sourceType: true,
            createdAt: true,
            contact: {
                select: { id: true, firstName: true, lastName: true, phone: true, email: true },
            },
        },
    });
    return members;
}

/**
 * Import all CONVERTED leads from a lead list into this audience.
 * Creates contacts from leads that haven't been converted yet is NOT done here —
 * conversion is a separate step in lead-generation.service.
 *
 * This syncs contacts that are already linked to leads in the list (via lead.contactId).
 */
export async function importFromLeadList(
    workspaceId: string,
    audienceId: string,
    input: ImportLeadListInput,
) {
    const audience = await getAudience(workspaceId, audienceId);
    const targetLeadListId = input.leadListId ?? audience.leadListId;

    if (!targetLeadListId) {
        throw Object.assign(
            new Error('No leadListId provided and this audience has no linked lead list'),
            { statusCode: 400, code: ErrorCodes.BAD_REQUEST },
        );
    }

    // Verify lead list belongs to workspace
    const leadList = await prisma.leadList.findFirst({
        where: { id: targetLeadListId, workspaceId },
        select: { id: true },
    });
    if (!leadList) {
        throw Object.assign(new Error('Lead list not found'), {
            statusCode: 404,
            code: ErrorCodes.NOT_FOUND,
        });
    }

    // Get all converted leads with a contactId in this list
    const convertedLeads = await prisma.lead.findMany({
        where: { leadListId: targetLeadListId, workspaceId, status: 'CONVERTED', contactId: { not: null } },
        select: { contactId: true },
    });

    const contactIds = convertedLeads
        .map(l => l.contactId)
        .filter(Boolean) as string[];

    if (contactIds.length === 0) {
        return { synced: 0, skipped: 0 };
    }

    const added = await _addMembers(workspaceId, audienceId, contactIds, 'lead_list');
    const skipped = contactIds.length - added;

    if (added > 0) {
        await prisma.audience.update({
            where: { id: audienceId },
            data: {
                memberCount: { increment: added },
                leadListId: targetLeadListId, // Link if not already
            },
        });
    }

    log.info({ audienceId, targetLeadListId, synced: added, skipped }, 'Lead list synced to audience');
    return { synced: added, skipped };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Bulk-inserts AudienceMember rows, skipping duplicates.
 * Returns the number of actually inserted rows.
 */
async function _addMembers(
    workspaceId: string,
    audienceId: string,
    contactIds: string[],
    sourceType: 'manual' | 'lead_list',
): Promise<number> {
    // Validate contacts belong to workspace
    const valid = await prisma.contact.findMany({
        where: { workspaceId, id: { in: contactIds } },
        select: { id: true },
    });
    const validIds = valid.map(c => c.id);

    if (validIds.length === 0) return 0;

    const result = await prisma.audienceMember.createMany({
        data: validIds.map(contactId => ({ audienceId, contactId, sourceType })),
        skipDuplicates: true,
    });

    return result.count;
}
