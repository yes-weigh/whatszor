import { z } from 'zod';

export const EventTypeSchema = z.enum([
  'message_received',
  'message_sent',
  'contact_created',
  'contact_updated',
  'conversation_started',
  'campaign_sent',
  'campaign_replied',
  'record_stage_changed',
  'webhook_received',
  'scheduled_trigger'
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const SystemEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: EventTypeSchema,
  timestamp: z.string().datetime(),
  source: z.string(),
  workspaceId: z.string(),
  authContext: z.object({
    userId: z.string()
  }).optional(),
  payload: z.record(z.any())
});

export type SystemEvent = z.infer<typeof SystemEventSchema>;
