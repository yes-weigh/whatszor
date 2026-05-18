import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../core/logger';
import { composeAndQueueMessage } from '../../core/messaging/message-composer';
import { createOrGetConversation } from '../../modules/messaging/conversation.service';
import { getQueue, QueueName } from '../../queues';
import { syncCampaignStats } from './campaign.service';

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
    if (campaign.status === 'CANCELLED') {
        log.info({ campaignId }, 'Campaign already CANCELLED — skipping execution');
        return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Update Status if Scheduled ────────────────────────────────────────────
    if (campaign.status === 'SCHEDULED') {
        log.info({ campaignId }, 'Transitioning campaign from SCHEDULED to RUNNING');
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'RUNNING', startedAt: new Date() }
        });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Resolve WhatsApp session ──────────────────────────────────────────────
    // The campaign must have a linked WhatsApp account to send from.
    let resolvedSessionId: string | null = null;

    if (campaign.whatsappAccountId) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: { id: campaign.whatsappAccountId },
            select: { sessionId: true, status: true },
        });
        if (account) {
            resolvedSessionId = account.sessionId;
            if (account.status !== 'CONNECTED') {
                log.warn({ campaignId, sessionId: account.sessionId }, 'Linked WhatsApp session is not CONNECTED — messages may not deliver');
            }
        }
    }

    if (!resolvedSessionId) {
        // Fallback: pick any connected session in the workspace
        const fallback = await prisma.whatsAppAccount.findFirst({
            where: { workspaceId, status: 'CONNECTED', deletedAt: null },
            select: { sessionId: true },
        });
        if (fallback) {
            log.warn({ campaignId }, 'No WhatsApp account linked to campaign — falling back to first connected session');
            resolvedSessionId = fallback.sessionId;
        } else {
            log.error({ campaignId }, 'No connected WhatsApp session found in workspace — aborting');
            await prisma.campaign.update({
                where: { id: campaignId },
                data: { status: 'CANCELLED', completedAt: new Date() },
            });
            return;
        }
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
        log.error({ campaignId }, 'Campaign missing template version and message text — aborting');
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'CANCELLED', completedAt: new Date() },
        });
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
        log.info({ campaignId }, 'No more pending members found — finalising campaign');
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'COMPLETED', completedAt: new Date() },
        });
        // Sync final aggregate stats onto the Campaign record
        await syncCampaignStats(workspaceId, campaignId);
        return;
    }

    for (const member of members) {
        try {
            if (!member.contact.phone) {
                throw new Error('Contact missing phone number');
            }

            // ── Dynamic Exclusion Check (Late Bound) ───────────────────────────────────
            // We check this again at send-time in case:
            // 1) The draft was saved without exclusion, but launched with exclusion toggled ON.
            // 2) A new chat was initiated between draft creation and campaign launch.
            if ((campaign.excludeExistingChats || campaign.excludeRecentChats) && resolvedSessionId) {
                const dateThreshold = (!campaign.excludeExistingChats && campaign.excludeRecentChats) ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) : undefined;
                
                const phone = member.contact.phone;
                const digits = phone.replace(/[^0-9]/g, '');
                const providerIdsToCheck = [
                    phone,
                    digits,
                    `+${digits}`,
                    `${digits}@s.whatsapp.net`,
                    `+${digits}@s.whatsapp.net`
                ];

                const existingConv = await prisma.conversation.findFirst({
                    where: {
                        workspaceId,
                        sessionId: resolvedSessionId,
                        ...(dateThreshold ? { lastMessageAt: { gte: dateThreshold } } : {}),
                        OR: [
                            { contactId: member.contactId },
                            { providerId: { in: providerIdsToCheck } }
                        ]
                    },
                    select: { id: true }
                });

                if (existingConv) {
                    log.info({ campaignId, memberId: member.id, phone }, 'Skipping member due to chat exclusion (late bound)');
                    await prisma.campaignMember.update({
                        where: { id: member.id },
                        data: {
                            status: 'FAILED', // We could use SKIPPED if we had it in the enum, but FAILED prevents sending.
                            errorReason: 'Skipped: Chat exclusion rule matched'
                        }
                    });
                    continue; // Skip queuing this message entirely
                }
            }
            // ──────────────────────────────────────────────────────────────────────────

            // Ensure conversation exists, pinned to the resolved WA session
            const conversation = await createOrGetConversation(workspaceId, {
                provider: 'WHATSAPP',
                providerId: member.contact.phone,
                sessionId: resolvedSessionId,
            });

            const isTemplate = !!templateVersionId;
            const message = await composeAndQueueMessage({
                workspaceId,
                conversationId: conversation.id,
                provider: 'WHATSAPP',
                providerId: member.contact.phone,
                // ← critical: tell the outbound worker which account to send with
                sessionId: resolvedSessionId,
                campaignId: campaign.id,
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
        }
    }

    // Recursively schedule the next batch if there are more
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

    // ── Sync final stats so the dashboard shows real sent/failed counts ───────
    await syncCampaignStats(workspaceId, campaignId);
    // ─────────────────────────────────────────────────────────────────────────

    log.info({ campaignId }, 'Campaign completely finished.');
}
