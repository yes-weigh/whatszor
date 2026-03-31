import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../prisma/client';
import { subDays, startOfDay, format, formatDistanceToNow } from 'date-fns';

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

    return reply.sendSuccess({
        totalContacts,
        activeConversations,
        campaignsSent,
        activeAutomations,
    });
}

export async function getDashboardChart(req: FastifyRequest, reply: FastifyReply) {
    const workspaceId = req.user.workspaceId;
    const days = 7;
    const startDate = startOfDay(subDays(new Date(), days - 1));

    // Get message activity over the last 7 days
    const messages = await prisma.message.groupBy({
        by: ['createdAt'],
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

    return reply.sendSuccess(chartData);
}

export async function getRecentActivity(req: FastifyRequest, reply: FastifyReply) {
    const workspaceId = req.user.workspaceId;

    // Fetch latest items across different domains
    const [recentContacts, recentCampaigns, recentAutomations] = await Promise.all([
        prisma.contact.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, firstName: true, lastName: true, createdAt: true },
        }),
        prisma.campaign.findMany({
            where: { workspaceId },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: { id: true, name: true, status: true, updatedAt: true },
        }),
        prisma.automationRule.findMany({
            where: { workspaceId },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: { id: true, name: true, status: true, updatedAt: true },
        })
    ]);

    // Normalize events
    const activities = [
        ...recentContacts.map(c => ({
            msg: `New contact added: ${c.firstName} ${c.lastName || ''}`.trim(),
            date: c.createdAt,
            dot: 'bg-accent'
        })),
        ...recentCampaigns.map(c => ({
            msg: c.status === 'COMPLETED' 
                ? `Campaign "${c.name}" completed`
                : `Campaign "${c.name}" status updated to ${c.status}`,
            date: c.updatedAt,
            dot: 'bg-success'
        })),
        ...recentAutomations.map(a => ({
            msg: `Automation "${a.name}" is now ${a.status}`,
            date: a.updatedAt,
            dot: 'bg-[#a78bfa]'
        }))
    ];

    // Sort by most recent
    activities.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Format for frontend
    const formattedActivities = activities.slice(0, 10).map(a => ({
        msg: a.msg,
        time: formatDistanceToNow(a.date, { addSuffix: true }),
        dot: a.dot
    }));

    return reply.sendSuccess(formattedActivities);
}
