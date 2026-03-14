/**
 * Campaign & Broadcast TypeScript interfaces shared across apps.
 */

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type CampaignMemberStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface CampaignStats {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
}

export interface Campaign {
    id: string;
    workspaceId: string;
    name: string;
    status: CampaignStatus;
    templateId: string | null;
    templateLanguage: string | null;
    scheduledAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    stats: CampaignStats | null;
    createdAt: string;
    updatedAt: string;
}

export interface CampaignMember {
    id: string;
    campaignId: string;
    contactId: string;
    status: CampaignMemberStatus;
    messageId: string | null;
    variables: Record<string, any> | null;
    errorReason: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateCampaignInput {
    name: string;
    templateId?: string | null;
    templateVersionId?: string | null;
    templateLanguage?: string | null;
    scheduledAt?: string | null;
    status?: CampaignStatus | null;
    contactIds?: string[] | null;
    audienceId?: string | null;
    whatsappAccountId?: string | null;
}

export interface UpdateCampaignInput {
    name?: string;
    status?: CampaignStatus;
    templateId?: string;
    templateLanguage?: string;
    scheduledAt?: string;
}

export interface AddCampaignMembersInput {
    members: {
        contactId: string;
        variables?: Record<string, any>;
    }[];
}
