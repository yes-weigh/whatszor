import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../prisma/client';
import { subDays, startOfDay, format, formatDistanceToNow } from 'date-fns';

export async function getSidebarStats(req: FastifyRequest, reply: FastifyReply) {
    const workspaceId = req.user.workspaceId;

    const [unreadConversations, runningCampaigns, liveAutomations] = await Promise.all([
        prisma.conversation.count({
            where: {
                workspaceId,
                unreadCount: { gt: 0 },
            },
        }),
        prisma.campaign.count({
            where: {
                workspaceId,
                status: { in: ['RUNNING', 'SCHEDULED'] },
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
        unreadConversations,
        runningCampaigns,
        liveAutomations,
    });
}

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

export async function getSalesAnalytics(req: FastifyRequest, reply: FastifyReply) {
    const workspaceId = req.user.workspaceId;
    
    // We fetch metrics for the last 30 days
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30));

    // 1. Fetch raw metrics
    const metrics = await prisma.agentDailyMetric.findMany({
        where: {
            workspaceId,
            date: { gte: thirtyDaysAgo }
        }
    });

    // 2. Fetch User instances manually to bypass missing relation
    const agentIds = Array.from(new Set(metrics.map(m => m.agentId)));
    const agents = await prisma.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true, email: true }
    });
    
    const agentDataMap = new Map(agents.map(a => [a.id, a]));

    // 3. Aggregate per-agent
    const agentStatsMap = new Map<string, any>();

    for (const metric of metrics) {
        if (!agentStatsMap.has(metric.agentId)) {
            const user = agentDataMap.get(metric.agentId);
            agentStatsMap.set(metric.agentId, {
                agentId: metric.agentId,
                name: user?.name || user?.email || metric.agentId,
                totalMessagesSent: 0,
                avgResponseTimeSum: 0,
                daysActive: 0
            });
        }
        
        const stat = agentStatsMap.get(metric.agentId);
        stat.totalMessagesSent += metric.messagesSent;
        if (metric.avgResponseSeconds > 0) {
            stat.avgResponseTimeSum += metric.avgResponseSeconds;
            stat.daysActive += 1;
        }
    }

    // 4. Format final data structure
    const agentLeaderboard = Array.from(agentStatsMap.values()).map(stat => {
        return {
            agentId: stat.agentId,
            name: stat.name,
            totalMessagesSent: stat.totalMessagesSent,
            avgResponseTimeStr: stat.daysActive > 0 
                ? formatDurationHumanReadable((stat.avgResponseTimeSum / stat.daysActive) * 1000)
                : 'N/A'
        };
    });

    // Sort by most active
    agentLeaderboard.sort((a, b) => b.totalMessagesSent - a.totalMessagesSent);

    // Provide global sum
    const totalWorkspaceMessages = agentLeaderboard.reduce((acc, curr) => acc + curr.totalMessagesSent, 0);

    return reply.sendSuccess({
        leaderboard: agentLeaderboard,
        totalMessagesSent: totalWorkspaceMessages
    });
}

// Utility to convert ms to human readable "Xm Ys"
function formatDurationHumanReadable(ms: number) {
    if (!ms || ms < 0) return 'N/A';
    if (ms < 1000) return '< 1s';
    
    let totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
