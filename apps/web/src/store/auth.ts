import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: [
    'contacts:create', 'contacts:read', 'contacts:update', 'contacts:delete',
    'campaigns:create', 'campaigns:read', 'campaigns:update', 'campaigns:delete',
    'automation:create', 'automation:read', 'automation:update', 'automation:delete',
    'members:read', 'members:manage',
    'conversations:read', 'conversations:reply',
    'media:manage', 'templates:manage',
    'workspace:view', 'workspace:manage', 'billing:manage' 
  ],
  ADMIN: [
    'contacts:create', 'contacts:read', 'contacts:update', 'contacts:delete',
    'campaigns:create', 'campaigns:read', 'campaigns:update', 'campaigns:delete',
    'automation:create', 'automation:read', 'automation:update', 'automation:delete',
    'members:read', 'members:manage',
    'conversations:read', 'conversations:reply',
    'media:manage', 'templates:manage',
    'workspace:view'
  ],
  MEMBER: [
    'contacts:create', 'contacts:read', 'contacts:update',
    'campaigns:read',
    'automation:read',
    'members:read',
    'conversations:read', 'conversations:reply',
    'media:manage', 'templates:manage',
    'workspace:view'
  ],
  VIEWER: [
    'contacts:read',
    'campaigns:read',
    'automation:read',
    'members:read',
    'conversations:read',
    'workspace:view'
  ]
};

const PERMISSION_SETS: Record<string, Set<string>> = {
  OWNER: new Set(ROLE_PERMISSIONS.OWNER),
  ADMIN: new Set(ROLE_PERMISSIONS.ADMIN),
  MEMBER: new Set(ROLE_PERMISSIONS.MEMBER),
  VIEWER: new Set(ROLE_PERMISSIONS.VIEWER)
};

interface User {
    id: string;
    name: string;
    email: string;
    workspaceId: string;
    role: string;
}

interface AuthState {
    user: User | null;
    accessToken: string | null;
    setAuth: (user: User, token: string) => void;
    logout: () => void;
    isAuthenticated: () => boolean;
    hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            accessToken: null,
            setAuth: (user, accessToken) => {
                localStorage.setItem('accessToken', accessToken);
                set({ user, accessToken });
            },
            logout: () => {
                localStorage.removeItem('accessToken');
                set({ user: null, accessToken: null });
                window.location.href = '/login';
            },
            isAuthenticated: () => !!get().accessToken,
            hasPermission: (permission: string) => {
                const role = get().user?.role;
                if (!role) return false;
                return PERMISSION_SETS[role]?.has(permission) || false;
            },
        }),
        {
            name: 'yesbheem-auth',
            partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
        }
    )
);
