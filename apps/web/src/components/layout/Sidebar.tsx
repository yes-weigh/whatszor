'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    MessageSquare, Users, Megaphone, Zap, LayoutDashboard,
    Settings, ChevronLeft, ChevronRight, Image, LayoutTemplate, Shield, MapPin
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import NextImage from 'next/image';

const navItems = [
    { href: '/inbox',         label: 'Inbox',         icon: MessageSquare,  requiredPermission: 'conversations:read' },
    { href: '/analytics',     label: 'Analytics',     icon: LayoutDashboard },
    { href: '/contacts',      label: 'Contacts',      icon: Users },
    { href: '/campaigns',     label: 'Campaigns',     icon: Megaphone },
    { href: '/leads',         label: 'Lead Generation', icon: MapPin },
    { href: '/automations',   label: 'Automations',   icon: Zap },
    { href: '/media',         label: 'Media Gallery', icon: Image },
    { href: '/templates',     label: 'Templates',     icon: LayoutTemplate },
    { href: '/dashboard/team',label: 'Team Access',   icon: Shield },
];

export function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { user, hasPermission } = useAuthStore();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Filter nav items the current user has permission to see
    const visibleNavItems = navItems.filter(item =>
        !item.requiredPermission || (isMounted && hasPermission(item.requiredPermission))
    );

    return (
        <aside
            className={`flex flex-col h-screen sticky top-0 border-r border-white/5 bg-black/40 backdrop-blur-xl shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-[220px]'}`}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 glass-card p-1">
                    <NextImage src="/logo.png" alt="WhatsVue Logo" width={24} height={24} className="object-contain" />
                </div>
                {!collapsed && (
                    <span className="font-bold text-sm tracking-wide text-white">
                        WhatsVue
                    </span>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 py-3 px-2 flex flex-col gap-1">
                {visibleNavItems.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href || pathname.startsWith(href + '/');
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`nav-item ${active ? 'active' : ''}`}
                            title={collapsed ? label : undefined}
                        >
                            <Icon size={18} className="shrink-0" />
                            {!collapsed && <span>{label}</span>}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom */}
            <div className="border-t border-white/5 px-2 py-3 flex flex-col gap-1">
                <Link href="/settings" className="nav-item" title={collapsed ? 'Settings' : undefined}>
                    <Settings size={18} className="shrink-0" />
                    {!collapsed && <span>Settings</span>}
                </Link>

                {isMounted && !collapsed && user && (
                    <div className="flex items-center gap-2 px-3 py-2 mt-1 rounded-lg glass-card p-2 border-transparent">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                            {user.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-xs font-medium truncate text-white">{user.name}</p>
                            <p className="text-xs truncate text-zinc-500">{user.email}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Collapse Toggle */}
            <button
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={() => setCollapsed(c => !c)}
                className="absolute -right-3 top-16 w-6 h-6 rounded-full flex items-center justify-center border border-white/10 bg-black/80 backdrop-blur-md text-zinc-400 hover:text-white hover:border-emerald-500/50 hover:shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all z-20"
            >
                {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>
        </aside>
    );
}
