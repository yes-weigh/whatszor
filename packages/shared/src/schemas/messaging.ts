import { z } from 'zod';
import { NonEmptyStringSchema, UuidSchema } from './common';

// ── Conversation ─────────────────────────────────────────────

export const CreateConversationSchema = z.object({
    provider: z.string().toUpperCase(),
    providerId: NonEmptyStringSchema,
    contactId: UuidSchema.optional().nullable(),
});

export const UpdateConversationSchema = z.object({
    status: z.enum(['ACTIVE', 'ARCHIVED', 'BLOCKED']).optional(),
    contactId: UuidSchema.optional().nullable(),
    // For UI marks as read
    unreadCount: z.number().int().min(0).optional(),
});

// ── Message (Internal Sending) ───────────────────────────────

export const SendMessageSchema = z.object({
    type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'TEMPLATE', 'SYSTEM']).default('TEXT'),
    content: z.string().optional().nullable(),
    mediaData: z.record(z.unknown()).optional().nullable(),
    sessionId: z.string().optional().nullable(), // Which WhatsApp account to send from
    templateVersionId: z.string().optional(),
    templateVariables: z.record(z.any()).optional()
});

// Types derived from Input schemas
export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;
export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
