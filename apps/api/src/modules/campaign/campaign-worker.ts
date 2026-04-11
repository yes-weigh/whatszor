import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';
import { composeAndQueueMessage } from '../../core/messaging/message-composer';
import { createOrGetConversation } from '../../modules/messaging/conversation.service';
import { getQueue, QueueName } from '../../queues';

const log = createLogger({ module: 'campaign-worker' });

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

    // ── Workspace Suspension Guard ────────────────────────────────────────────
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { status: true },
    });
    if (workspace?.status === 'SUSPENDED') {
        log.warn({ workspaceId, campaignId }, 'Workspace SUSPENDED — aborting campaign execution');
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'CANCELLED' },
        });
        return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Campaign Cancellation Guard ───────────────────────────────────────────
    // Re-check before processing. The campaign may have been cancelled between
    // job enqueue and this point.
    if (campaign.status === 'CANCELLED') {
        log.info({ campaignId }, 'Campaign already CANCELLED — skipping execution');
        return;
    }
    // ─────────────────────────────────────────────────────────────────────────

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

    if (!templateVersionId && !campaign.messageText) {
        log.error({ campaignId }, 'Campaign missing template version and message text');
        return;
    }

    const BATCH_SIZE = 500;
    // Process members pending delivery
    const members = await prisma.campaignMember.findMany({
        where: {
            campaignId,
            status: 'PENDING'
        },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
        include: {
            contact: true
        }
    });

    log.info({ campaignId, batchCount: members.length }, 'Processing campaign members batch');

    if (members.length === 0) {
        log.info({ campaignId }, 'No more pending members found.');
        return;
    }

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

            const isTemplate = !!templateVersionId;
            const message = await composeAndQueueMessage({
                workspaceId,
                conversationId: conversation.id,
                provider: 'WHATSAPP',
                providerId: member.contact.phone, // Real JID resolution happens in WA worker
                campaignId: campaign.id,
                // We rely on outbound worker's per-session limit now, so no arbitrary delay needed
                delay: 0,
                ...(isTemplate ? {
                    templateVersionId: (member.templateVersionId || templateVersionId) as string,
                    templateVariables: {
                        contact: member.contact.customData as any,
                        ...((member.variables as Record<string, any>) || {})
                    }
                } : {
                    type: 'TEXT',
                    content: campaign.messageText || '',
                })
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

    // Recursively schedule the next batch
    if (members.length === BATCH_SIZE) {
        log.info({ campaignId }, 'Batch complete, scheduling next batch chunk.');
        await getQueue(QueueName.CAMPAIGN).add(job.name, job.data, { delay: 1000 });
        return;
    }

    await prisma.campaign.update({
        where: { id: campaignId },
        data: {
            status: 'COMPLETED',
            completedAt: new Date()
        }
    });

    log.info({ campaignId }, 'Campaign completely finished.');
}
