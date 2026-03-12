import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { logger } from '../../core/logger';
import { composeAndQueueMessage } from '../../core/messaging/message-composer';

const log = logger.child({ module: 'campaign-worker' });

export async function processCampaignJob(job: Job) {
    const { workspaceId, campaignId } = job.data;

    log.info({ campaignId }, 'Starting campaign execution...');

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId }
    });

    if (!campaign || !campaign.templateVersionId) {
        log.error({ campaignId }, 'Campaign not found or missing template version');
        return;
    }

    // Process members pending delivery
    const members = await prisma.campaignMember.findMany({
        where: {
            campaignId,
            status: 'PENDING'
        },
        include: {
            contact: true
        }
    });

    log.info({ campaignId, pendingCount: members.length }, 'Processing campaign members');

    for (const member of members) {
        try {
            if (!member.contact.phone) {
                throw new Error('Contact missing phone number');
            }

            // Universal Messaging Pipeline integration
            const message = await composeAndQueueMessage({
                workspaceId,
                conversationId: `cmp-${campaignId}-${member.contactId}`, // Simplified pseudo-conversation or resolve real one
                provider: 'WHATSAPP',
                providerId: member.contact.phone, // Real JID resolution happens in WA worker
                templateVersionId: member.templateVersionId || campaign.templateVersionId!,
                templateVariables: {
                    contact: member.contact.customData as any,
                    ...((member.variables as Record<string, any>) || {})
                }
            });

            // Mark as queued locally
            await prisma.campaignMember.update({
                where: { id: member.id },
                data: {
                    status: 'PROCESSING',
                    messageId: message.id
                }
            });

        } catch (error: any) {
            log.error({ memberId: member.id, err: error }, 'Failed to queue campaign message for member');
            await prisma.campaignMember.update({
                where: { id: member.id },
                data: {
                    status: 'FAILED',
                    errorReason: error.message || 'Unknown error during composing'
                }
            });
        }
    }

    await prisma.campaign.update({
        where: { id: campaignId },
        data: {
            status: 'COMPLETED',
            completedAt: new Date()
        }
    });

    log.info({ campaignId }, 'Campaign execution finished.');
}
