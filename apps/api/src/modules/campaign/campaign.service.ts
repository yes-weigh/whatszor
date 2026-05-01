import { prisma } from '../../prisma/client';
import type { CreateCampaignInput, AddCampaignMembersInput, UpdateCampaignInput } from '@whatszor/shared';

import { ErrorCodes } from '@whatszor/shared';
import { logEvent } from '../../core/event-logger';
import { QueueName, getQueue } from '../../queues';
import { PLAN_LIMITS } from '../../core/config/pricing';

export async function createCampaign(workspaceId: string, input: CreateCampaignInput) {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { planTier: true },
    });
    
    // Check daily campaign limit
    const limit = PLAN_LIMITS[workspace?.planTier || 'FREE'].maxCampaignsPerDay;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const campaignsToday = await prisma.campaign.count({
        where: {
            workspaceId,
            createdAt: { gte: today }
        }
    });

    if (campaignsToday >= limit) {
        throw Object.assign(
            new Error(`Daily campaign limit reached. Upgrade your plan to create more than ${limit} campaigns per day.`),
            { code: 'PAYMENT_REQUIRED', statusCode: 402 }
        );
    }

    const campaign = await prisma.campaign.create({
        data: {
            workspaceId,
            name: input.name,
            templateId: input.templateId || null,
            templateVersionId: input.templateVersionId || null,
            templateLanguage: input.templateLanguage || null,
            messageText: input.messageText || null,
            expectedReplyRate: input.expectedReplyRate || null,
            scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
            audienceId: input.audienceId || null,
            whatsappAccountId: input.whatsappAccountId || null,
            excludeExistingChats: input.excludeExistingChats || false,
            excludeRecentChats: input.excludeRecentChats || false,
        },
    });

    if (input.audienceId) {
        await populateFromAudience(workspaceId, campaign.id, input.audienceId);
    } else if (input.contactIds && input.contactIds.length > 0) {
        const payload = input.contactIds.map(id => ({ contactId: id }));
        await addCampaignMembers(workspaceId, campaign.id, { members: payload });
    }

    return campaign;
}

export async function getCampaigns(workspaceId: string, skip: number = 0, take: number = 20) {
    const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
            where: { workspaceId },
            skip,
            take,
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { members: true } }
            }
        }),
        prisma.campaign.count({ where: { workspaceId } }),
    ]);

    return { campaigns, total };
}

export async function getCampaign(workspaceId: string, campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId, workspaceId },
        include: {
            _count: { select: { members: true } }
        }
    });

    if (!campaign) {
        throw { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: `Campaign ${campaignId} not found` };
    }

    return campaign;
}

export async function cancelCampaign(workspaceId: string, campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId, workspaceId }
    });

    if (!campaign) {
        throw { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: `Campaign ${campaignId} not found` };
    }

    const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'CANCELLED' }
    });

    // Mark pending members as failed to give visual feedback that they won't be sent
    await prisma.campaignMember.updateMany({
        where: { campaignId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', errorReason: 'Campaign cancelled by user' }
    });

    return updated;
}

export async function updateCampaign(
    workspaceId: string,
    campaignId: string,
    input: UpdateCampaignInput,
    actorUserId: string,
    actorRole: string,
) {
    // Verify existence
    await getCampaign(workspaceId, campaignId);

    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.status !== undefined) data.status = input.status;
    if (input.templateId !== undefined) data.templateId = input.templateId || null;
    if ((input as any).templateVersionId !== undefined) data.templateVersionId = (input as any).templateVersionId || null;
    if (input.templateLanguage !== undefined) data.templateLanguage = input.templateLanguage || null;
    if (input.messageText !== undefined) data.messageText = input.messageText || null;
    if (input.expectedReplyRate !== undefined) data.expectedReplyRate = input.expectedReplyRate || null;
    if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.excludeExistingChats !== undefined) data.excludeExistingChats = input.excludeExistingChats;
    if (input.excludeRecentChats !== undefined) data.excludeRecentChats = input.excludeRecentChats;

    // ── Campaign session ownership validation ───────────────────────────────────────
    if ((input as any).whatsappAccountId !== undefined) {
        const newAccountId = (input as any).whatsappAccountId || null;
        if (newAccountId) {
            // Account must belong to this workspace (prevents cross-workspace leakage)
            const account = await prisma.whatsAppAccount.findFirst({
                where: { id: newAccountId, workspaceId, deletedAt: null },
                select: { userId: true },
            });
            if (!account) {
                throw Object.assign(
                    new Error('WhatsApp account not found or does not belong to this workspace'),
                    { code: ErrorCodes.NOT_FOUND, statusCode: 404 },
                );
            }
            // MEMBER: can only assign sessions they personally own
            if (actorRole === 'MEMBER' && account.userId !== actorUserId) {
                throw Object.assign(
                    new Error('Access denied: you can only assign sessions you own to campaigns'),
                    { code: ErrorCodes.FORBIDDEN, statusCode: 403 },
                );
            }
        }
        data.whatsappAccountId = newAccountId;
    }
    // ────────────────────────────────────────────────────────────────────────────

    const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data,
    });

    return updated;
}

export async function addCampaignMembers(workspaceId: string, campaignId: string, input: AddCampaignMembersInput) {
    // 1. Verify Campaign belongs to workspace
    const campaign = await getCampaign(workspaceId, campaignId);

    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
        throw { statusCode: 400, code: ErrorCodes.BAD_REQUEST, message: 'Cannot add members to a running or completed campaign' };
    }

    // 2. Validate all contacts belong to workspace
    const contactIds = input.members.map(m => m.contactId);

    // Chunk queries to avoid huge IN clauses if large
    const validContacts = await prisma.contact.findMany({
        where: {
            workspaceId,
            id: { in: contactIds }
        },
        select: { id: true }
    });

    const validContactIds = new Set(validContacts.map((c: { id: string }) => c.id));

    // 3. Filter input to only valid contacts (or throw error for invalid chunks)
    let validMembersToAdd = input.members.filter(m => validContactIds.has(m.contactId));

    if ((campaign.excludeExistingChats || campaign.excludeRecentChats) && campaign.whatsappAccountId) {
        const dateThreshold = (!campaign.excludeExistingChats && campaign.excludeRecentChats) ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) : undefined;
        const existingConversations = await prisma.conversation.findMany({
            where: {
                workspaceId,
                sessionId: campaign.whatsappAccountId,
                ...(dateThreshold ? { lastMessageAt: { gte: dateThreshold } } : {}),
                contactId: { in: validMembersToAdd.map(m => m.contactId) }
            },
            select: { contactId: true }
        });

        const excludeContactIds = new Set(existingConversations.map(c => c.contactId).filter(Boolean));
        validMembersToAdd = validMembersToAdd.filter(m => !excludeContactIds.has(m.contactId));
    }

    if (validMembersToAdd.length === 0) {
        throw { statusCode: 400, code: ErrorCodes.BAD_REQUEST, message: 'No valid contacts provided for this workspace' };
    }

    // 4. Bulk insert, ignoring conflicts using createMany
    const created = await prisma.campaignMember.createMany({
        data: validMembersToAdd.map(m => ({
            campaignId,
            contactId: m.contactId,
            variables: m.variables || {},
            templateVersionId: campaign.templateVersionId, // Inherit immutable version from campaign
            status: 'PENDING'
        })),
        skipDuplicates: true // Ignore if already added
    });

    return { added: created.count };
}

/**
 * Initiates a campaign by queuing a background job to process the members.
 */
export async function startCampaign(workspaceId: string, campaignId: string, isFastMode: boolean = false) {
    const campaign = await getCampaign(workspaceId, campaignId);

    if (campaign.status === 'RUNNING' || campaign.status === 'COMPLETED') {
        throw { statusCode: 400, code: ErrorCodes.BAD_REQUEST, message: 'Campaign is already running or completed' };
    }

    // ── Pre-flight Broadcast Usage Enforcement ────────────────────────────────
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new Error('Workspace not found');

    const nowStr = new Date().toISOString().substring(0, 7); // 'YYYY-MM' format
    let currentUsage = workspace.broadcastUsageCurrentMonth;

    // Reset if month rolled over
    if (workspace.broadcastUsageMonth !== nowStr) {
        currentUsage = 0;
    }

    const memberCount = await prisma.campaignMember.count({ where: { campaignId } });
    const limit = PLAN_LIMITS[workspace.planTier].maxBroadcastMessagesPerMonth;

    if (currentUsage + memberCount > limit) {
        throw Object.assign(
            new Error(`Broadcast limit exceeded for the current month (${limit.toLocaleString()}). You have ${(limit - currentUsage).toLocaleString()} left, but this campaign has ${memberCount.toLocaleString()} recipients. Please upgrade your plan.`),
            { statusCode: 403, code: 'LIMIT_EXCEEDED' }
        );
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Mark as running and deduct quota atomically
    const updated = await prisma.$transaction(async (tx) => {
        await tx.workspace.update({
            where: { id: workspaceId },
            data: {
                broadcastUsageMonth: nowStr,
                broadcastUsageCurrentMonth: currentUsage + memberCount
            }
        });

        return tx.campaign.update({
            where: { id: campaignId },
            data: {
                status: 'RUNNING',
                startedAt: new Date(),
            }
        });
    });

    // Enqueue job. The worker will paginate through CampaignMembers and push them to outbound routing.
    await getQueue(QueueName.CAMPAIGN).add(`campaign-${campaignId}`, {
        workspaceId,
        campaignId,
        isFastMode
    });

    // Log global event
    await logEvent(workspaceId, 'campaign_sent', 'campaign_module', {
        campaignId: updated.id,
        name: updated.name,
        templateId: updated.templateId
    });

    return updated;
}

/**
 * Recalculates the JSON stats object on the Campaign model by aggregating all
 * CampaignMember statuses. Completely idempotent and race-condition free.
 */
export async function syncCampaignStats(workspaceId: string, campaignId: string) {
    const stats = await prisma.campaignMember.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { status: true }
    });

    const parsedStats: any = {
        total: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        paused: 0
    };

    // Calculate absolute isolated counts
    for (const stat of stats) {
        const count = stat._count.status;
        parsedStats.total += count;
        if (stat.status === 'SENT') parsedStats.sent += count;
        if (stat.status === 'DELIVERED') parsedStats.delivered += count;
        if (stat.status === 'READ') parsedStats.read += count;
        if (stat.status === 'FAILED') parsedStats.failed += count;
    }

    parsedStats.paused = await prisma.campaignMember.count({
        where: { campaignId, errorReason: { startsWith: 'Paused' } }
    });

    // Cumulative Funnel logic:
    // A READ message is implicitly DELIVERED and SENT.
    // A DELIVERED message is implicitly SENT.
    parsedStats.delivered += parsedStats.read;
    parsedStats.sent += parsedStats.delivered;

    await prisma.campaign.update({
        where: { id: campaignId, workspaceId },
        data: { stats: parsedStats as any }
    });
}

export async function deleteCampaign(workspaceId: string, campaignId: string) {
    const campaign = await getCampaign(workspaceId, campaignId);

    if (campaign.status === 'RUNNING') {
        throw { statusCode: 400, code: ErrorCodes.BAD_REQUEST, message: 'Cannot delete a running campaign' };
    }

    await prisma.$transaction([
        prisma.campaignMember.deleteMany({ where: { campaignId } }),
        prisma.campaign.delete({ where: { id: campaignId } })
    ]);

    return { deleted: true };
}

/**
 * Snapshot all members of an Audience into the Campaign's CampaignMember list.
 * Must be called before the campaign is started. Campaign worker only reads
 * CampaignMember rows — the audience is NOT queried at send time.
 *
 * Guards:
 *  - Campaign must be DRAFT or SCHEDULED
 *  - Audience must have at least one member (prevents empty-blast)
 *  - Campaign and Audience must belong to the same workspace
 */
export async function populateFromAudience(
    workspaceId: string,
    campaignId: string,
    audienceId: string,
) {
    const campaign = await getCampaign(workspaceId, campaignId);

    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
        throw {
            statusCode: 400,
            code: ErrorCodes.BAD_REQUEST,
            message: 'Cannot populate members into a running or completed campaign',
        };
    }

    // Verify audience belongs to workspace
    const audience = await prisma.audience.findFirst({
        where: { id: audienceId, workspaceId },
        select: { id: true, memberCount: true },
    });
    if (!audience) {
        throw { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: 'Audience not found' };
    }

    if (audience.memberCount === 0) {
        throw {
            statusCode: 400,
            code: ErrorCodes.BAD_REQUEST,
            message: 'Audience has no members. Add contacts to the audience before running a campaign.',
        };
    }

    // Snapshot: read all audience members at this moment
    const members = await prisma.audienceMember.findMany({
        where: { audienceId },
        select: { contactId: true, contact: { select: { phone: true } } },
    });

    let contactIds = members.map(m => m.contactId);

    if ((campaign.excludeExistingChats || campaign.excludeRecentChats) && campaign.whatsappAccountId) {
        const dateThreshold = (!campaign.excludeExistingChats && campaign.excludeRecentChats) ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) : undefined;
        
        const existingConversations = await prisma.conversation.findMany({
            where: {
                workspaceId,
                sessionId: campaign.whatsappAccountId,
                ...(dateThreshold ? { lastMessageAt: { gte: dateThreshold } } : {}),
                OR: [
                    { contactId: { in: contactIds } },
                    { providerId: { in: members.map(m => m.contact.phone ? `+${m.contact.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net` : null).filter(Boolean) as string[] } },
                ]
            },
            select: { contactId: true, providerId: true }
        });

        const excludeContactIds = new Set<string>();
        for (const conv of existingConversations) {
            if (conv.contactId) excludeContactIds.add(conv.contactId);
        }

        const phoneToContactId = new Map<string, string>();
        for (const m of members) {
            if (m.contact.phone) {
                phoneToContactId.set(`+${m.contact.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`, m.contactId);
                phoneToContactId.set(`${m.contact.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`, m.contactId);
            }
        }

        for (const conv of existingConversations) {
            if (phoneToContactId.has(conv.providerId)) {
                excludeContactIds.add(phoneToContactId.get(conv.providerId)!);
            }
        }

        contactIds = contactIds.filter(id => !excludeContactIds.has(id));
    }

    if (contactIds.length === 0) {
        return { added: 0, audienceId, memberCount: audience.memberCount };
    }

    // Bulk insert into campaign (skipping existing duplicates)
    const created = await prisma.campaignMember.createMany({
        data: contactIds.map(contactId => ({
            campaignId,
            contactId,
            variables: {},
            templateVersionId: campaign.templateVersionId,
            status: 'PENDING',
        })),
        skipDuplicates: true,
    });

    // Track which audience sourced this campaign (informational)
    await prisma.campaign.update({
        where: { id: campaignId },
        data: { audienceId },
    });

    return { added: created.count, audienceId, memberCount: audience.memberCount };
}

