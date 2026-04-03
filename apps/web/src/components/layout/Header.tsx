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
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-0 z-30 transition-all">
            <div>
                <h1 className="font-semibold text-lg text-white">{title}</h1>
                {subtitle && <p className="text-sm text-zinc-400">{subtitle}</p>}
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-black/60 focus-within:border-emerald-500/50 focus-within:shadow-[0_0_10px_rgba(16,185,129,0.2)] focus-within:bg-black/90 transition-all duration-300">
                    <Search size={16} className="text-zinc-500" />
                    <input
                        className="bg-transparent text-sm outline-none w-48 text-white placeholder:text-zinc-600 transition-all"
                        placeholder="Search workspace..."
                    />
                </div>
                <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                    <button aria-label="Notifications" className="btn btn-ghost p-2 relative hover:bg-black/40 rounded-lg transition-all active:scale-95">
                        <Bell size={18} className="text-zinc-400 hover:text-white" />
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" />
                    </button>
                    <button aria-label="Log out" onClick={logout} className="btn btn-ghost p-2 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 rounded-lg transition-all active:scale-95">
                        <LogOut size={18} className="text-zinc-400 transition-colors" />
                    </button>
                </div>
            </div>
        </header>
    );
}
