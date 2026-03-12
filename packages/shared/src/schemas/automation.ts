import { z } from 'zod';
import { NonEmptyStringSchema, UuidSchema } from './common';
import { EventTypeSchema } from './events';

// ── Trigger Types ────────────────────────────────────────────

// The root event that kicks off a rule
export const TriggerTypeSchema = z.enum([
    'CONTACT_CREATED',
    'CONTACT_UPDATED',
    'STAGE_CHANGED',
    'MESSAGE_RECEIVED',
    'TAG_ADDED',
    'CAMPAIGN_REPLY',
    'WEBHOOK_RECEIVED',
    'SCHEDULED_TRIGGER'
]);

// Context specific configuration for a trigger
export const StageChangedTriggerSchema = z.object({
    type: z.literal('STAGE_CHANGED'),
    pipelineId: z.string().optional(),
    stageId: z.string().optional(),
});

export const BaseTriggerSchema = z.object({
    type: z.enum(['CONTACT_CREATED', 'CONTACT_UPDATED', 'MESSAGE_RECEIVED', 'TAG_ADDED', 'CAMPAIGN_REPLY', 'WEBHOOK_RECEIVED', 'SCHEDULED_TRIGGER']),
});

export const TriggerConfigSchema = z.discriminatedUnion('type', [
    BaseTriggerSchema,
    StageChangedTriggerSchema,
]);

export type TriggerType = z.infer<typeof TriggerTypeSchema>;
export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;

// ── Condition Types ──────────────────────────────────────────

export const ConditionOperatorSchema = z.enum(['eq', 'neq', 'gt', 'lt', 'contains', 'not_contains', 'is_set', 'is_not_set']);

export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

export type ConditionExpression = {
    type: 'expression';
    field: string;
    operator: ConditionOperator;
    value?: any;
} | {
    type: 'group';
    logicalOperator: 'AND' | 'OR';
    conditions: ConditionExpression[];
};

export const ConditionNodeSchema: z.ZodType<ConditionExpression> = z.lazy(() => z.union([
    z.object({
        type: z.literal('expression'),
        field: NonEmptyStringSchema,
        operator: ConditionOperatorSchema,
        value: z.any().optional(),
    }),
    z.object({
        type: z.literal('group'),
        logicalOperator: z.enum(['AND', 'OR']),
        conditions: z.array(ConditionNodeSchema),
    })
]));

// ── Action Types ─────────────────────────────────────────────

export const ActionTypeSchema = z.enum([
    // Messaging
    'SEND_WHATSAPP', 'SEND_TEMPLATE', 'SEND_MEDIA', 'SEND_BUTTONS', 'SEND_LIST',
    // CRM
    'UPDATE_CONTACT', 'CHANGE_STAGE', 'ADD_TAG', 'REMOVE_TAG', 'CREATE_CONTACT', 'ASSIGN_AGENT',
    // Automation
    'TRIGGER_FLOW', 'CREATE_ACTIVITY', 'PAUSE_AUTOMATION', 'DELAY',
    // AI
    'AI_REPLY', 'AI_INTENT', 'AI_EXTRACT', 'KB_LOOKUP',
    // Integration
    'WEBHOOK', 'HTTP_REQUEST', 'DB_QUERY',
    // Handoff
    'HUMAN_HANDOFF', 'NOTIFY_TEAM'
]);

export const SendWhatsAppActionSchema = z.object({
    type: z.literal('SEND_WHATSAPP'),
    templateId: z.string().optional(),
    templateLanguage: z.string().optional(),
    messageContent: z.string().optional(), // If not using template
});

export const DelayActionSchema = z.object({
    type: z.literal('DELAY'),
    minutes: z.number().int().positive(),
});

export const ChangeStageActionSchema = z.object({
    type: z.literal('CHANGE_STAGE'),
    pipelineId: z.string(),
    stageId: z.string(),
});

export const BasicActionSchema = z.object({
    type: z.enum([
        'UPDATE_CONTACT', 'ADD_TAG', 'REMOVE_TAG', 'CREATE_CONTACT', 'ASSIGN_AGENT',
        'TRIGGER_FLOW', 'CREATE_ACTIVITY', 'PAUSE_AUTOMATION',
        'AI_REPLY', 'AI_INTENT', 'AI_EXTRACT', 'KB_LOOKUP',
        'WEBHOOK', 'HTTP_REQUEST', 'DB_QUERY',
        'HUMAN_HANDOFF', 'NOTIFY_TEAM',
        'SEND_TEMPLATE', 'SEND_MEDIA', 'SEND_BUTTONS', 'SEND_LIST'
    ]),
    payload: z.record(z.any()).optional(),
});

export const ActionConfigSchema = z.discriminatedUnion('type', [
    SendWhatsAppActionSchema,
    DelayActionSchema,
    ChangeStageActionSchema,
    BasicActionSchema,
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;
export type ActionConfig = z.infer<typeof ActionConfigSchema>;

// ── Core Models ──────────────────────────────────────────────

export const ReactFlowDefinitionSchema = z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
});
export type ReactFlowDefinition = z.infer<typeof ReactFlowDefinitionSchema>;

export const AutomationRuleStatusSchema = z.enum(['ACTIVE', 'DRAFT', 'INACTIVE']);
export type AutomationRuleStatus = z.infer<typeof AutomationRuleStatusSchema>;

export const AutomationRuleSchema = z.object({
    id: UuidSchema,
    workspaceId: UuidSchema,
    name: NonEmptyStringSchema,
    description: z.string().nullable(),
    status: AutomationRuleStatusSchema,
    eventType: EventTypeSchema.nullable().optional(),
    isActive: z.boolean().default(true),
    trigger: TriggerConfigSchema.nullable().optional(),
    conditions: z.array(ConditionNodeSchema).default([]),
    actions: z.array(ActionConfigSchema).optional(),
    flowDefinition: ReactFlowDefinitionSchema.nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;

export const AutomationExecutionStatusSchema = z.enum(['RUNNING', 'PAUSED', 'COMPLETED', 'FAILED']);
export type AutomationExecutionStatus = z.infer<typeof AutomationExecutionStatusSchema>;

export const AutomationExecutionSchema = z.object({
    id: UuidSchema,
    ruleId: UuidSchema,
    contactId: UuidSchema,
    status: AutomationExecutionStatusSchema,
    currentStep: z.number().int().min(0),
    context: z.record(z.any()).nullable(),
    resumeAt: z.string().datetime().nullable(),
    errorReason: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export type AutomationExecution = z.infer<typeof AutomationExecutionSchema>;

// ── Input Models ─────────────────────────────────────────────

export const CreateAutomationRuleSchema = z.object({
    name: NonEmptyStringSchema,
    description: z.string().optional(),
    eventType: EventTypeSchema.optional(),
    isActive: z.boolean().optional(),
    trigger: TriggerConfigSchema.optional(),
    conditions: z.array(ConditionNodeSchema).default([]),
    actions: z.array(ActionConfigSchema).optional(),
    flowDefinition: ReactFlowDefinitionSchema.optional(),
});
export type CreateAutomationRuleInput = z.infer<typeof CreateAutomationRuleSchema>;

export const UpdateAutomationRuleSchema = z.object({
    name: NonEmptyStringSchema.optional(),
    description: z.string().optional(),
    status: AutomationRuleStatusSchema.optional(),
    eventType: EventTypeSchema.optional(),
    isActive: z.boolean().optional(),
    trigger: TriggerConfigSchema.optional(),
    conditions: z.array(ConditionNodeSchema).optional(),
    actions: z.array(ActionConfigSchema).optional(),
    flowDefinition: ReactFlowDefinitionSchema.optional(),
});
export type UpdateAutomationRuleInput = z.infer<typeof UpdateAutomationRuleSchema>;
