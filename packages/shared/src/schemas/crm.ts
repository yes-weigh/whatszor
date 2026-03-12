import { z } from 'zod';
import { NonEmptyStringSchema, EmailSchema, PhoneSchema, UuidSchema } from './common';

const CustomDataSchema = z.record(z.unknown()).default({});

// ── Contact ──────────────────────────────────────────────────

export const CreateContactSchema = z.object({
    firstName: NonEmptyStringSchema.max(100),
    lastName: z.string().max(100).optional().nullable(),
    email: EmailSchema.optional().nullable(),
    phone: PhoneSchema.optional().nullable(),
    orgId: UuidSchema.optional().nullable(),
    customData: CustomDataSchema,
});

export const UpdateContactSchema = CreateContactSchema.partial();

// ── Organization ─────────────────────────────────────────────

export const CreateOrganizationSchema = z.object({
    name: NonEmptyStringSchema.max(255),
    website: z.string().url().max(255).optional().nullable(),
    industry: z.string().max(100).optional().nullable(),
    customData: CustomDataSchema,
});

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial();

// ── Pipeline ─────────────────────────────────────────────────

export const CreatePipelineSchema = z.object({
    name: NonEmptyStringSchema.max(100),
    description: z.string().max(500).optional().nullable(),
});

export const UpdatePipelineSchema = CreatePipelineSchema.partial();

// ── Stage ────────────────────────────────────────────────────

export const CreateStageSchema = z.object({
    pipelineId: UuidSchema, // Usually derived from route param, but validated
    name: NonEmptyStringSchema.max(100),
    order: z.number().int().min(0).default(0),
});

export const UpdateStageSchema = CreateStageSchema.partial();

// ── Record ───────────────────────────────────────────────────

export const CreateRecordSchema = z.object({
    pipelineId: UuidSchema,
    stageId: UuidSchema,
    contactId: UuidSchema.optional().nullable(),
    orgId: UuidSchema.optional().nullable(),
    title: NonEmptyStringSchema.max(255),
    value: z.number().nonnegative().optional().nullable(),
    currency: z.string().length(3).default('USD'),
    status: z.enum(['OPEN', 'WON', 'LOST', 'ABANDONED']).default('OPEN'),
    customData: CustomDataSchema,
});

export const UpdateRecordSchema = CreateRecordSchema.partial().extend({
    // Can be updated via partial, including moving stages
    stageId: UuidSchema.optional(),
});

export type CreateContactInput = z.infer<typeof CreateContactSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;
export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>;
export type CreateStageInput = z.infer<typeof CreateStageSchema>;
export type UpdateStageInput = z.infer<typeof UpdateStageSchema>;
export type CreateRecordInput = z.infer<typeof CreateRecordSchema>;
export type UpdateRecordInput = z.infer<typeof UpdateRecordSchema>;
