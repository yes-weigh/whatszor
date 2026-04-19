'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Key, Users, LogOut, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const isLogin = pathname === '/admin/login';
    const { isAuthenticated, user, logout } = useAuthStore();

    if (isLogin) {
        return <>{children}</>;
    }

    // Only show admin nav if logged in as admin/staff
    const isAdmin = isAuthenticated() && (user?.role === 'SUPER_ADMIN' || user?.role === 'STAFF');

    return (
        <div className="min-h-screen bg-gray-950 text-gray-200 flex">
            {isAdmin && (
                <aside className="fixed top-0 left-0 w-64 h-full bg-gray-900 border-r border-gray-800 flex flex-col z-50">
                    <div className="p-6 border-b border-gray-800">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                            <Key className="text-red-500" /> Whatsvue Admin
                        </h2>
                    </div>
                    <nav className="p-4 flex flex-col gap-2 flex-1">
                        <Link 
                            href="/admin/dashboard" 
                            className={`flex items-center gap-3 p-3 rounded-lg font-medium transition-colors ${pathname === '/admin/dashboard' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                        >
                            <Key size={18} /> Licenses
                        </Link>
                        <Link 
                            href="/admin/workspaces" 
                            className={`flex items-center gap-3 p-3 rounded-lg font-medium transition-colors ${pathname === '/admin/workspaces' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                        >
                            <Users size={18} /> Dealers
                        </Link>
                        <Link 
                            href="/admin/payments" 
                            className={`flex items-center gap-3 p-3 rounded-lg font-medium transition-colors ${pathname === '/admin/payments' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                        >
                            <CreditCard size={18} /> Payments
                        </Link>
                        <Link 
                            href="/admin/settings" 
                            className={`flex items-center gap-3 p-3 rounded-lg font-medium transition-colors ${pathname === '/admin/settings' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                        >
                            <Key size={18} /> System Settings
                        </Link>
                        <div className="flex-1" />
                        <button 
                            onClick={() => { logout(); router.push('/admin/login'); }}
                            className="flex items-center gap-3 p-3 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors w-full text-left font-medium"
                        >
                            <LogOut size={18} /> Logout
                        </button>
                    </nav>
                </aside>
            )}
            <main className={`flex-1 flex flex-col min-h-screen ${isAdmin ? 'ml-64' : ''}`}>
                {children}
            </main>
        </div>
    );
}
