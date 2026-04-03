import { z } from 'zod';
import { NonEmptyStringSchema, UuidSchema } from './common';

// ── Campaign Core ────────────────────────────────────────────

export const CampaignStatusSchema = z.enum(['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED']);
export const CampaignMemberStatusSchema = z.enum(['PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED']);

export const CampaignStatsSchema = z.object({
    total: z.number(),
    sent: z.number(),
    delivered: z.number(),
    read: z.number(),
    failed: z.number(),
}).passthrough();

export const CampaignSchema = z.object({
    id: UuidSchema,
    workspaceId: UuidSchema,
    name: NonEmptyStringSchema,
    status: CampaignStatusSchema,
    templateId: z.string().nullable(),
    templateLanguage: z.string().nullable(),
    messageText: z.string().nullable().optional(),
    expectedReplyRate: z.number().nullable().optional(),
    scheduledAt: z.string().datetime().nullable(),
    startedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    stats: CampaignStatsSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

export const CampaignMemberSchema = z.object({
    id: UuidSchema,
    campaignId: UuidSchema,
    contactId: UuidSchema,
    status: CampaignMemberStatusSchema,
    messageId: UuidSchema.nullable(),
    variables: z.record(z.any()).nullable(),
    errorReason: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

// ── Campaign Inputs ──────────────────────────────────────────

export const CreateCampaignSchema = z.object({
    name: NonEmptyStringSchema,
    templateId: z.string().optional().nullable(),
    templateVersionId: z.string().optional().nullable(),
    templateLanguage: z.string().optional().nullable(),
    messageText: z.string().optional().nullable(),
    expectedReplyRate: z.number().optional().nullable(),
    scheduledAt: z.string().datetime().optional().nullable(),
    status: CampaignStatusSchema.optional().nullable(),
    contactIds: z.array(z.string()).optional().nullable(),
    audienceId: z.string().optional().nullable(),
    whatsappAccountId: z.string().optional().nullable(),
});

export const UpdateCampaignSchema = z.object({
    name: NonEmptyStringSchema.optional(),
    status: CampaignStatusSchema.optional(),
    templateId: z.string().optional(),
    templateLanguage: z.string().optional(),
    messageText: z.string().optional(),
    expectedReplyRate: z.number().optional(),
    scheduledAt: z.string().datetime().optional(),
});

export const AddCampaignMembersSchema = z.object({
    members: z.array(
        z.object({
            contactId: UuidSchema,
            variables: z.record(z.any()).optional(),
        })
    ).min(1).max(1000), // Max 1000 per request
});
