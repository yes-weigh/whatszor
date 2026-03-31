export enum Permission {
  SESSION_CREATE = 'SESSION_CREATE',
  SESSION_VIEW_OWN = 'SESSION_VIEW_OWN',
  SESSION_VIEW_ALL = 'SESSION_VIEW_ALL',
  SESSION_SEND = 'SESSION_SEND',

  // Placeholder for other domain permissions if needed in the future
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_BILLING = 'MANAGE_BILLING',
}

export const RolePermissions: Record<string, Permission[]> = {
  OWNER: [
    Permission.SESSION_VIEW_ALL,
    Permission.SESSION_CREATE,
    Permission.SESSION_SEND,
    Permission.MANAGE_USERS,
    Permission.MANAGE_BILLING,
  ],
  ADMIN: [
    Permission.SESSION_VIEW_ALL,
    Permission.SESSION_CREATE,
    Permission.SESSION_SEND,
    Permission.MANAGE_USERS,
  ],
  MEMBER: [
    Permission.SESSION_VIEW_OWN,
    Permission.SESSION_CREATE,
    Permission.SESSION_SEND,
  ],
  VIEWER: [],
};

/**
 * Helper strictly enforcing permission existence on a role.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const allowed = RolePermissions[role.toUpperCase()];
  if (!allowed) return false;
  return allowed.includes(permission);
}
