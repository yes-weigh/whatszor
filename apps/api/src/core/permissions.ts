import { UserRole } from '@prisma/client';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  OWNER: [
    'contacts:create', 'contacts:read', 'contacts:update', 'contacts:delete',
    'campaigns:create', 'campaigns:read', 'campaigns:update', 'campaigns:delete',
    'automation:create', 'automation:read', 'automation:update', 'automation:delete',
    'members:read', 'members:manage',
    'conversations:read', 'conversations:reply',
    'media:manage', 'templates:manage',
    'workspace:view', 'workspace:manage', 'workspace:settings:read', 'billing:manage',
  ],
  ADMIN: [
    'contacts:create', 'contacts:read', 'contacts:update', 'contacts:delete',
    'campaigns:create', 'campaigns:read', 'campaigns:update', 'campaigns:delete',
    'automation:create', 'automation:read', 'automation:update', 'automation:delete',
    'members:read', 'members:manage',
    'conversations:read', 'conversations:reply',
    'media:manage', 'templates:manage',
    'workspace:view', 'workspace:settings:read',
    // NOTE: workspace:manage and billing:manage are OWNER-only
  ],
  MEMBER: [
    'contacts:create', 'contacts:read', 'contacts:update',
    'campaigns:read',
    'automation:read',
    'members:read',
    'conversations:read', 'conversations:reply',
    'media:manage', 'templates:manage',
    'workspace:view',
  ],
  VIEWER: [
    'contacts:read',
    'campaigns:read',
    'automation:read',
    'members:read',
    'conversations:read',
    'workspace:view',
  ],
};

// Precompute Sets for constant-time lookups
export const PERMISSION_SETS: Record<UserRole, Set<string>> = {
  OWNER: new Set(ROLE_PERMISSIONS.OWNER),
  ADMIN: new Set(ROLE_PERMISSIONS.ADMIN),
  MEMBER: new Set(ROLE_PERMISSIONS.MEMBER),
  VIEWER: new Set(ROLE_PERMISSIONS.VIEWER)
};
