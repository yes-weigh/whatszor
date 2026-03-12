'use client';

import { Search, Bell, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

interface HeaderProps {
    title: string;
    subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
    const { logout } = useAuthStore();

    return (
        <header className="h-14 flex items-center justify-between px-6 border-b border-theme bg-surface sticky top-0 z-10">
            <div>
                <h1 className="font-semibold text-base text-primary">{title}</h1>
                {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
            </div>

            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-theme bg-elevated">
                    <Search size={14} className="text-muted" />
                    <input
                        className="bg-transparent text-sm outline-none w-44 text-primary placeholder:text-muted"
                        placeholder="Search..."
                    />
                </div>
                <button aria-label="Notifications" className="btn btn-ghost p-2 relative">
                    <Bell size={16} />
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />
                </button>
                <button aria-label="Log out" onClick={logout} className="btn btn-ghost p-2">
                    <LogOut size={16} />
                </button>
            </div>
        </header>
    );
}
