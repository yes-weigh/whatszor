'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    MessageSquare, Users, Megaphone, Zap, LayoutDashboard,
    Settings, ChevronLeft, ChevronRight, Bot, Image, LayoutTemplate, Shield
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

const navItems = [
    { href: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
    { href: '/conversations', label: 'Conversations', icon: MessageSquare,  requiredPermission: 'conversations:read' },
    { href: '/contacts',      label: 'Contacts',      icon: Users },
    { href: '/campaigns',     label: 'Campaigns',     icon: Megaphone },
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
            className={`flex flex-col h-screen sticky top-0 border-r border-theme bg-surface shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-[220px]'}`}
        >
            {/* Logo */}
            <div className="flex items-center gap-2 px-4 h-14 border-b border-theme">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent flex-shrink-0">
                    <Bot size={16} color="#fff" />
                </div>
                {!collapsed && (
                    <span className="font-bold text-sm tracking-tight text-primary">
                        Whatsvue
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
            <div className="border-t border-theme px-2 py-3 flex flex-col gap-1">
                <Link href="/settings" className="nav-item" title={collapsed ? 'Settings' : undefined}>
                    <Settings size={18} className="shrink-0" />
                    {!collapsed && <span>Settings</span>}
                </Link>

                {isMounted && !collapsed && user && (
                    <div className="flex items-center gap-2 px-3 py-2 mt-1 rounded-lg bg-elevated">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-accent text-white">
                            {user.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-xs font-medium truncate text-primary">{user.name}</p>
                            <p className="text-xs truncate text-muted">{user.email}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Collapse Toggle */}
            <button
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={() => setCollapsed(c => !c)}
                className="absolute -right-3 top-16 w-6 h-6 rounded-full flex items-center justify-center border border-theme bg-elevated text-secondary"
            >
                {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>
        </aside>
    );
}
