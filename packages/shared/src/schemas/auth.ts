import { z } from 'zod';
import { EmailSchema, NonEmptyStringSchema, SlugSchema } from './common';

// ── Auth ──────────────────────────────────────────────────

export const RegisterSchema = z.object({
    name: NonEmptyStringSchema.max(100),
    email: EmailSchema,
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128),
    workspaceName: NonEmptyStringSchema.max(100),
    workspaceSlug: SlugSchema,
});

export const LoginSchema = z.object({
    email: EmailSchema,
    password: z.string().min(1),
    workspaceSlug: SlugSchema,
});

export const RefreshTokenSchema = z.object({
    refreshToken: z.string().min(1),
});

// ── Workspace ─────────────────────────────────────────────

export const UpdateWorkspaceSchema = z.object({
    name: NonEmptyStringSchema.max(100).optional(),
    settings: z.record(z.unknown()).optional(),
});

export const InviteMemberSchema = z.object({
    email: EmailSchema,
    role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
