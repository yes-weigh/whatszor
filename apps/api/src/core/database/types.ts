import { UserRole } from '@prisma/client';

export interface UserContext {
    userId: string;
    workspaceId: string;
    role: UserRole;
}
