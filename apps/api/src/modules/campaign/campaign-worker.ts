import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { logger } from '../../core/logger';
import { composeAndQueueMessage } from '../../core/messaging/message-composer';
import { createOrGetConversation } from '../../modules/messaging/conversation.service';

const log = logger.child({ module: 'campaign-worker' });

export async function processCampaignJob(job: Job) {
    const { workspaceId, campaignId } = job.data;

    log.info({ campaignId }, 'Starting campaign execution...');

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId }
    });

    if (!campaign) {
        log.error({ campaignId }, 'Campaign not found');
        return;
    }

    let templateVersionId = campaign.templateVersionId;

    if (!templateVersionId && campaign.templateId) {
        // Fallback: Resolve highest available version for this template
        const latestVersion = await prisma.templateVersion.findFirst({
            where: { templateId: campaign.templateId },
            orderBy: { version: 'desc' },
            select: { id: true }
        });
        if (latestVersion) {
            templateVersionId = latestVersion.id;
        }
    }

    if (!templateVersionId) {
        log.error({ campaignId }, 'Campaign missing template version');
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

    let processed = 0;

    for (const member of members) {
        try {
            if (!member.contact.phone) {
                throw new Error('Contact missing phone number');
            }

            // Ensure conversation exists
            const conversation = await createOrGetConversation(workspaceId, {
                provider: 'WHATSAPP',
                providerId: member.contact.phone,
            });

            // Stagger messages to prevent burst sending
            const MIN_DELAY_MS = 3000;
            const JITTER_MS = 2000;
            const jobDelay = processed * (MIN_DELAY_MS + Math.floor(Math.random() * JITTER_MS));

            // Universal Messaging Pipeline integration
            const message = await composeAndQueueMessage({
                workspaceId,
                conversationId: conversation.id,
                provider: 'WHATSAPP',
                providerId: member.contact.phone, // Real JID resolution happens in WA worker
                campaignId: campaign.id,
                delay: jobDelay,
                templateVersionId: member.templateVersionId || templateVersionId,
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
            
            processed++;

        } catch (error: any) {
            log.error({ memberId: member.id, err: error }, 'Failed to queue campaign message for member');
            await prisma.campaignMember.update({
                where: { id: member.id },
                data: {
                    status: 'FAILED',
                    errorReason: error.message || 'Unknown error during composing'
                }
            });
            
            const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
            if (c) {
                const stats = (c.stats as Record<string, number>) || {};
                stats.failed = (stats.failed || 0) + 1;
                await prisma.campaign.update({
                    where: { id: campaignId },
                    data: { stats: stats as any }
                });
            }
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
