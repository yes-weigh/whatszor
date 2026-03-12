/**
 * CRM-related TypeScript interfaces shared across apps.
 */

export interface Contact {
    id: string;
    workspaceId: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    orgId: string | null;
    customData: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface Organization {
    id: string;
    workspaceId: string;
    name: string;
    website: string | null;
    industry: string | null;
    customData: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface Pipeline {
    id: string;
    workspaceId: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    stages?: Stage[]; // optional inclusion
}

export interface Stage {
    id: string;
    pipelineId: string;
    name: string;
    order: number;
    createdAt: Date;
    updatedAt: Date;
}

export type RecordStatus = 'OPEN' | 'WON' | 'LOST' | 'ABANDONED';

export interface CrmRecord {
    id: string;
    workspaceId: string;
    pipelineId: string;
    stageId: string;
    contactId: string | null;
    orgId: string | null;
    title: string;
    value: number | null; // Note: Prisma Decimal converts to number/string on client
    currency: string | null;
    status: RecordStatus;
    customData: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
