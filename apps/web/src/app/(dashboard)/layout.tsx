'use client';

import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { MobileHeaderProvider, useMobileHeader } from '@/context/MobileHeaderContext';

function MobileTopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
    const { title } = useMobileHeader();
    return (
        <div className="md:hidden flex items-center justify-between px-3 py-3 border-b border-theme bg-surface z-40 shrink-0">
            <button
                onClick={onMenuOpen}
                className="p-2 -ml-2 text-muted hover:text-primary transition-colors focus:outline-none"
                aria-label="Open Menu"
            >
                <Menu size={20} />
            </button>
            <span className="font-semibold text-sm text-primary tracking-tight">{title}</span>
            <div className="w-8" /> {/* Spacer */}
        </div>
    );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user, setAuth } = useAuthStore();
    const router = useRouter();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (!isAuthenticated()) {
            router.push('/login');
        } else if (!user || !user.role) {
            import('@/lib/api').then(({ default: api }) => {
                api.get('/auth/me')
                   .then(res => {
                       const me = res.data as any;
                       if (me) {
                           setAuth({ id: me.id, name: me.name, email: me.email, workspaceId: me.workspaceId, role: me.role }, localStorage.getItem('accessToken')!, localStorage.getItem('refreshToken')!);
                           if (me.workspaceStatus && me.workspaceStatus !== 'ACTIVE') {
                               router.push('/workspace/unlock');
                           }
                       }
                   })
                   .catch(() => router.push('/login'));
            });
        } else {
            import('@/lib/api').then(({ default: api }) => {
                api.get('/auth/me').then(res => {
                    const me = res.data as any;
                    if (me && me.workspaceStatus && me.workspaceStatus !== 'ACTIVE') {
                        router.push('/workspace/unlock');
                    }
                }).catch(() => {});
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-base relative">
            <MobileTopBar onMenuOpen={() => setIsMobileMenuOpen(true)} />

            <Sidebar
                isMobileMenuOpen={isMobileMenuOpen}
                closeMobileMenu={() => setIsMobileMenuOpen(false)}
            />

            <main className="flex-1 overflow-y-auto relative z-0 flex flex-col min-w-0 h-[calc(100vh-49px)] md:h-screen">
                {children}
            </main>
        </div>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <MobileHeaderProvider>
            <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </MobileHeaderProvider>
    );
}

