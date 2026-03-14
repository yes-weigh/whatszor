import { prisma } from '../../prisma/client';

/**
 * Resolves an Audience and snaps all its members natively into the Campaign processing layer.
 * Enforces transaction safety and strict @@unique cross-check idempotency.
 */
export async function buildCampaignSnapshotForAudience(workspaceId: string, campaignId: string, audienceId: string) {
    // 1. Verify Campaign belongs to workspace
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId, workspaceId },
        select: { id: true, workspaceId: true },
    });
    if (!campaign) throw new Error('Campaign not found or does not belong to workspace');

    // 2. Wrap the snapshot resolution natively in a Transaction
    return prisma.$transaction(async (tx) => {
        // Find audience securely by tenant bounding.
        const audience = await tx.audience.findUnique({
            where: { id: audienceId, workspaceId },
            include: {
                members: {
                    select: { contactId: true },
                },
            },
        });

        if (!audience) throw new Error('Audience not found in this workspace.');

        const payload = audience.members.map((c: any) => ({
            campaignId,
            contactId: c.contactId,
            status: 'PENDING' as any,
        }));

        if (payload.length === 0) return 0;

        // Uses skipDuplicates driven by schema unique compound key idempotency
        const result = await tx.campaignMember.createMany({
            data: payload,
            skipDuplicates: true,
        });

        // Optionally associate the campaign tightly to the audience for reporting UI
        await tx.campaign.update({
            where: { id: campaignId },
            data: { audienceId: audience.id },
        });

        return result.count;
    });
}
