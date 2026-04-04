import { z } from 'zod';

export const CreateAudienceSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    description: z.string().max(500).optional(),
    // Optionally pre-populate from contacts
    contactIds: z.string().array().optional(),
    // If created from a lead list (auto-names the audience after the list)
    leadListId: z.string().optional(),
});

export const UpdateAudienceSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
});

export const AddAudienceMembersSchema = z.object({
    contactIds: z.string().array().min(1, 'Provide at least one contact'),
    sourceType: z.enum(['manual', 'lead_list']).default('manual'),
});

export const RemoveAudienceMembersSchema = z.object({
    contactIds: z.string().array().min(1, 'Provide at least one contact'),
});

export const ImportLeadListSchema = z.object({
    // If omitted, uses the leadListId already linked to this audience
    leadListId: z.string().optional(),
    skipExisting: z.boolean().default(true),
});

export const PopulateCampaignFromAudienceSchema = z.object({
    audienceId: z.string().min(1, 'audienceId is required'),
});

export type CreateAudienceInput   = z.infer<typeof CreateAudienceSchema>;
export type UpdateAudienceInput   = z.infer<typeof UpdateAudienceSchema>;
export type AddAudienceMembersInput    = z.infer<typeof AddAudienceMembersSchema>;
export type RemoveAudienceMembersInput = z.infer<typeof RemoveAudienceMembersSchema>;
export type ImportLeadListInput   = z.infer<typeof ImportLeadListSchema>;
