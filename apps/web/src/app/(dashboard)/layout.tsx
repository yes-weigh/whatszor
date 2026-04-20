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

function AdminImpersonationBanner() {
    const { user, setAuth, logout } = useAuthStore();
    const router = useRouter();

    if (!user?.isImpersonating) return null;

    const handleReturn = () => {
        const adminToken = localStorage.getItem('adminAccessToken');
        if (adminToken) {
            // Restore admin token
            setAuth(
                { id: user.id, name: user.name, email: user.email, workspaceId: 'ADMIN_WORKSPACE', role: 'SUPER_ADMIN', isImpersonating: false }, 
                adminToken, 
                ''
            );
            // Remove the stored admin token
            localStorage.removeItem('adminAccessToken');
            router.push('/admin/workspaces');
        } else {
            // Fallback if we somehow lost it
            logout();
        }
    };

    return (
        <div className="bg-red-600 text-white text-xs font-medium px-4 py-1.5 flex items-center justify-between shrink-0 z-[100]">
            <span>You are currently impersonating an organization. Actions performed are logged.</span>
            <button onClick={handleReturn} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded transition-colors text-white font-semibold">
                Return to Admin
            </button>
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
                           setAuth({ id: me.id, name: me.name, email: me.email, workspaceId: me.workspaceId, role: me.role, isImpersonating: me.isImpersonating }, localStorage.getItem('accessToken')!, localStorage.getItem('refreshToken')!);
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
        <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-base relative">
            <AdminImpersonationBanner />
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
                <MobileTopBar onMenuOpen={() => setIsMobileMenuOpen(true)} />

                <Sidebar
                    isMobileMenuOpen={isMobileMenuOpen}
                    closeMobileMenu={() => setIsMobileMenuOpen(false)}
                />

                <main className="flex-1 overflow-y-auto relative z-0 flex flex-col min-w-0 h-[calc(100vh-49px)] md:h-full">
                    {children}
                </main>
            </div>
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

