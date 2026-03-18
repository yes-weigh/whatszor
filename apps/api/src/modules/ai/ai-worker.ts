import { Job } from 'bullmq';
import { logger } from '../../core/logger';
import { prisma } from '../../prisma/client';
import { generateChatbotReply } from './ai.service';

const log = logger.child({ module: 'ai-worker' });

export async function processAiJob(job: Job) {
    const { workspaceId, conversationId } = job.data;
    
    log.info({ conversationId, workspaceId }, 'AI worker processing message');

    try {
        // 1. Double check if AI is enabled for this workspace (future flag)
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { settings: true }
        });
        
        const settings = (workspace?.settings as any) || {};
        if (settings.aiEnabled === false) {
             log.info({ workspaceId }, 'AI is disabled for this workspace in settings');
             return;
        }

        // 2. Generate reply using Gemini
        const reply = await generateChatbotReply(workspaceId, conversationId);
        
        if (!reply) {
            log.info({ conversationId }, 'AI produced no reply');
            return;
        }

        // 3. Create outbound message record as a suggestion
        const message = await prisma.message.create({
            data: {
                conversationId,
                direction: 'OUTBOUND',
                type: 'TEXT',
                content: reply,
                status: 'SUGGESTED', // Suggestion mode!
                senderUserId: 'AI_SUGGESTION',
            }
        });

        log.info({ messageId: message.id }, 'AI suggestion generated');

    } catch (err: any) {
        log.error({ err, conversationId }, 'Error in AI worker');
        throw err;
    }
}
