'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldAlert, KeyRound, Building2, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isLogin = pathname === '/admin/login';
    const { isAuthenticated, user, logout } = useAuthStore();

    if (isLogin) {
        return <>{children}</>;
    }

    // Only show admin nav if we are supposedly logged into admin
    const isAdmin = isAuthenticated() && user?.role === 'SUPER_ADMIN';

    return (
        <div className="min-h-screen bg-black flex flex-col">
            {isAdmin && (
                <header className="bg-gray-950 border-b border-gray-800 flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <ShieldAlert size={16} className="text-red-500" />
                        </div>
                        <span className="text-lg font-bold text-white tracking-tight">Whatszor Admin</span>
                    </div>

                    <nav className="flex items-center gap-1">
                        <Link 
                            href="/admin/dashboard" 
                            className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${pathname === '/admin/dashboard' ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'}`}
                        >
                            <KeyRound size={16} />
                            Licenses
                        </Link>
                        <Link 
                            href="/admin/workspaces" 
                            className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${pathname === '/admin/workspaces' ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'}`}
                        >
                            <Building2 size={16} />
                            Dealers
                        </Link>
                        
                        <div className="w-px h-6 bg-gray-800 mx-2"></div>
                        
                        <button 
                            onClick={() => {
                                logout();
                                window.location.href = '/admin/login';
                            }}
                            className="px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-gray-900 transition-colors"
                        >
                            <LogOut size={16} />
                            Log Out
                        </button>
                    </nav>
                </header>
            )}
            <main className="flex-1 flex flex-col">{children}</main>
        </div>
    );
}
