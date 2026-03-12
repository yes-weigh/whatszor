import { z } from 'zod';

export const DashboardStatsSchema = z.object({
    totalContacts: z.number(),
    activeConversations: z.number(),
    campaignsSent: z.number(),
    activeAutomations: z.number(),
});

export const DashboardChartSchema = z.array(
    z.object({
        date: z.string(),
        messages: z.number(),
        contacts: z.number(),
    })
);

export type DashboardStatsResponse = z.infer<typeof DashboardStatsSchema>;
export type DashboardChartResponse = z.infer<typeof DashboardChartSchema>;
