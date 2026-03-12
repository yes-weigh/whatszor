/**
 * Core workspace/tenant context passed through every authenticated request.
 */
export interface WorkspaceContext {
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
}

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface WorkspacePlan {
    id: string;
    name: string;
    maxUsers: number;
    maxContacts: number;
    maxConversations: number;
    features: string[];
}
