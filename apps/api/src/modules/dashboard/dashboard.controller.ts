import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../prisma/client';
import { subDays, startOfDay, format } from 'date-fns';

export async function getDashboardStats(req: FastifyRequest, reply: FastifyReply) {
    const workspaceId = req.user.workspaceId;

    const [totalContacts, activeConversations, campaignsSent, activeAutomations] = await Promise.all([
        prisma.contact.count({
            where: { workspaceId },
        }),
        prisma.conversation.count({
            where: {
                workspaceId,
                status: 'ACTIVE',
            },
        }),
        prisma.campaign.count({
            where: {
                workspaceId,
                status: 'COMPLETED',
            },
        }),
        prisma.automationRule.count({
            where: {
                workspaceId,
                status: 'ACTIVE',
            },
        }),
    ]);

    return reply.send({
        success: true,
        data: {
            totalContacts,
            activeConversations,
            campaignsSent,
            activeAutomations,
        },
    });
}

export async function getDashboardChart(req: FastifyRequest, reply: FastifyReply) {
    const workspaceId = req.user.workspaceId;
    const days = 7;
    const startDate = startOfDay(subDays(new Date(), days - 1));

    // Get message activity over the last 7 days
    const messages = await prisma.message.groupBy({
        by: ['createdAt'], // Grouping by exact timestamp, we'll bucket in JS to support generic DBs
        where: {
            conversation: { workspaceId },
            createdAt: { gte: startDate },
        },
        _count: true,
    });

    // Get new contacts over the last 7 days
    const contacts = await prisma.contact.groupBy({
        by: ['createdAt'],
        where: {
            workspaceId,
            createdAt: { gte: startDate },
        },
        _count: true,
    });

    // Bucket into days
    const chartData = Array.from({ length: days }).map((_, i) => {
        const date = startOfDay(subDays(new Date(), days - 1 - i));
        const dateStr = format(date, 'MMM dd');

        const dayMessages = messages
            .filter((m) => startOfDay(m.createdAt).getTime() === date.getTime())
            .reduce((sum, m) => sum + m._count, 0);

        const dayContacts = contacts
            .filter((c) => startOfDay(c.createdAt).getTime() === date.getTime())
            .reduce((sum, c) => sum + c._count, 0);

        return {
            date: dateStr,
            messages: dayMessages,
            contacts: dayContacts,
        };
    });

    return reply.send({
        success: true,
        data: chartData,
    });
}
