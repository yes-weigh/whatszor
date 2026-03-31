'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user, setAuth } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (!isAuthenticated()) {
            router.push('/login');
        } else if (!user || !user.role) {
            // Hydrate stale sessions where the store only has the token
            import('@/lib/api').then(({ default: api }) => {
                api.get('/auth/me')
                   .then(res => {
                       const me = res.data as any;
                       if (me) {
                           setAuth({ id: me.id, name: me.name, email: me.email, workspaceId: me.workspaceId, role: me.role }, localStorage.getItem('accessToken')!, localStorage.getItem('refreshToken')!);
                           // Gate: only ACTIVE workspaces can access dashboard
                           if (me.workspaceStatus && me.workspaceStatus !== 'ACTIVE') {
                               router.push('/workspace/unlock');
                           }
                       }
                   })
                   .catch(() => router.push('/login'));
            });
        } else {
            // Check workspace gating for already-hydrated sessions
            import('@/lib/api').then(({ default: api }) => {
                api.get('/auth/me').then(res => {
                    const me = res.data as any;
                    if (me && me.workspaceStatus && me.workspaceStatus !== 'ACTIVE') {
                        router.push('/workspace/unlock');
                    }
                }).catch(() => {});
            });
        }
    }, [isAuthenticated, user, router, setAuth]);

    return (
        <div className="flex h-screen overflow-hidden bg-base">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
