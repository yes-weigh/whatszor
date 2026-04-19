'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    MessageSquare, Users, Users2, Megaphone, Zap, LayoutDashboard,
    Settings, Image, LayoutTemplate, MapPin,
    LogOut
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import NextImage from 'next/image';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

// ─── Navigation structure with section grouping ───────────────────────────────
const navSections = [
    {
        label: 'MAIN',
        items: [
            {
                id: 'inbox',
                href: '/inbox',
                label: 'Inbox',
                icon: MessageSquare,
                requiredPermission: 'conversations:read',
            },
            {
                href: '/analytics',
                label: 'Analytics',
                icon: LayoutDashboard,
            },
        ],
    },
    {
        label: 'CRM',
        items: [
            { href: '/contacts',  label: 'Contacts',  icon: Users },
            { href: '/audiences', label: 'Audiences', icon: Users2 },
        ],
    },
    {
        label: 'GROWTH',
        items: [
            {
                id: 'campaigns',
                href: '/campaigns',
                label: 'Campaigns',
                icon: Megaphone,
            },
            { href: '/leads', label: 'Lead Generation', icon: MapPin },
        ],
    },
    {
        label: 'AUTOMATION',
        items: [
            {
                id: 'automations',
                href: '/automations',
                label: 'Automations',
                icon: Zap,
            },
        ],
    },
    {
        label: 'CONTENT',
        items: [
            { href: '/media',     label: 'Media Gallery', icon: Image },
            { href: '/templates', label: 'Templates',     icon: LayoutTemplate },
        ],
    },
];

// ─── Badge components ─────────────────────────────────────────────────────────
function CountBadge({ count }: { count: number }) {
    return (
        <span className="sidebar-badge-count">
            {count > 99 ? '99+' : count}
        </span>
    );
}

function StatusBadge({ label }: { label: string }) {
    return (
        <span className="sidebar-badge-status">
            <span className="sidebar-badge-dot" />
            {label}
        </span>
    );
}

function LiveBadge({ label }: { label: string }) {
    return (
        <span className="sidebar-badge-live">
            <span className="sidebar-badge-dot-live" />
            {label}
        </span>
    );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
interface SidebarProps {
    isMobileMenuOpen?: boolean;
    closeMobileMenu?: () => void;
}

export function Sidebar({ isMobileMenuOpen = false, closeMobileMenu }: SidebarProps = {}) {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [showLogout, setShowLogout] = useState(false);

    const { user, hasPermission, logout } = useAuthStore();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => { setIsMounted(true); }, []);

    // Close mobile menu on route navigation
    useEffect(() => {
        if (closeMobileMenu) closeMobileMenu();
    }, [pathname]);

    // Fetch live sidebar stat badges
    const { data: stats } = useQuery({
        queryKey: ['sidebar-stats'],
        queryFn: async () => {
            const res = await api.get('/dashboard/sidebar');
            return res.data || { unreadConversations: 0, runningCampaigns: 0, liveAutomations: 0 };
        },
        enabled: isMounted && !!user,
        refetchInterval: 15000, // Poll every 15s to keep sidebar fresh
    });

    const { data: workspace } = useQuery({
        queryKey: ['workspace-current'],
        queryFn: () => api.get('/workspaces/me').then(r => r.data),
        enabled: isMounted && !!user,
        staleTime: 5 * 60 * 1000, // Cache for 5 mins
    });

    const isActive = (href: string) =>
        pathname === href || pathname.startsWith(href + '/');

    return (
        <>
            {isMobileMenuOpen && (
                <div 
                    className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity"
                    onClick={closeMobileMenu}
                />
            )}
            <aside 
                className={`sidebar z-50 ${isMobileMenuOpen ? 'sidebar--expanded' : collapsed ? 'sidebar--collapsed' : 'sidebar--expanded'} ${isMobileMenuOpen ? 'fixed inset-y-0 left-0 translate-x-0' : 'fixed inset-y-0 left-0 -translate-x-full md:relative md:translate-x-0'} transition-transform duration-300 md:transition-[width]`}
            >

            {/* ── Workspace header (branding + switcher) ─────────────────── */}
            <div className="sidebar-header">
                <div 
                    className={`sidebar-logo-mark ${isMobileMenuOpen ? 'cursor-default' : 'cursor-pointer'}`} 
                    onClick={() => { if (!isMobileMenuOpen) setCollapsed(!collapsed); }}
                    title={isMobileMenuOpen ? undefined : collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    <NextImage src="/logo.png" alt="WhatsVue" width={18} height={18} className="object-contain" />
                </div>
                {!collapsed && (
                    <>
                        <div className="sidebar-workspace-info">
                            <span className="sidebar-workspace-name">{workspace?.name || 'WhatsVue'}</span>
                            <span className={`sidebar-workspace-plan !text-[10px] uppercase font-bold tracking-wider ${(workspace?.planTier !== 'FREE' ? workspace?.planTier : workspace?.plan?.toUpperCase()) === 'FREE' ? 'text-zinc-500' : 'text-green-500'}`}>
                                {workspace?.planTier !== 'FREE' ? workspace?.planTier : (workspace?.plan?.toUpperCase() || 'FREE')}
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* ── Navigation ─────────────────────────────────────────────── */}
            <nav className="sidebar-nav">
                {navSections.map(({ label, items }) => {
                    const visibleItems = items.filter(item =>
                        !(item as any).requiredPermission || (isMounted && hasPermission((item as any).requiredPermission))
                    );
                    if (!visibleItems.length) return null;

                    return (
                        <div key={label} className="sidebar-section">
                            {visibleItems.map((item: any) => {
                                const { id, href, label: itemLabel, icon: Icon, badge } = item;
                                const active = isActive(href);
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        className={`sidebar-nav-item ${active ? 'sidebar-nav-item--active' : ''}`}
                                        title={collapsed ? itemLabel : undefined}
                                    >
                                        <Icon
                                            size={16}
                                            className={`sidebar-nav-icon ${active ? 'sidebar-nav-icon--active' : ''}`}
                                        />
                                        {!collapsed && (
                                            <>
                                                <span className="sidebar-nav-label">{itemLabel}</span>
                                                
                                                {/* Dynamic Badges based on ID and stats */}
                                                {id === 'inbox' && (stats?.unreadConversations || 0) > 0 && (
                                                    <CountBadge count={stats.unreadConversations} />
                                                )}
                                                {id === 'campaigns' && (stats?.runningCampaigns || 0) > 0 && (
                                                    <StatusBadge label="running" />
                                                )}
                                                {id === 'automations' && (stats?.liveAutomations || 0) > 0 && (
                                                    <LiveBadge label="live" />
                                                )}
                                                
                                                {/* Legacy static badges if any exist */}
                                                {badge?.type === 'count' && id !== 'inbox' && (
                                                    <CountBadge count={badge.count} />
                                                )}
                                                {badge?.type === 'status' && id !== 'campaigns' && (
                                                    <StatusBadge label={badge.status} />
                                                )}
                                                {badge?.type === 'live' && id !== 'automations' && (
                                                    <LiveBadge label={badge.status} />
                                                )}
                                            </>
                                        )}
                                        {/* collapsed mode: show count dot only */}
                                        {collapsed && (
                                            (id === 'inbox' && (stats?.unreadConversations || 0) > 0) || (badge?.type === 'count')
                                        ) && (
                                            <span className="sidebar-badge-dot-collapsed" />
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    );
                })}
            </nav>



            {/* ── Bottom zone ────────────────────────────────────────────── */}
            <div className="sidebar-bottom">
                <Link
                    href="/settings"
                    className={`sidebar-nav-item ${isActive('/settings') ? 'sidebar-nav-item--active' : ''}`}
                    title={collapsed ? 'Settings' : undefined}
                >
                    <Settings size={16} className="sidebar-nav-icon" />
                    {!collapsed && <span className="sidebar-nav-label">Settings</span>}
                </Link>

                {isMounted && user && (
                    <div 
                        className="sidebar-user cursor-pointer relative"
                        onClick={() => setShowLogout(!showLogout)}
                        title="Toggle user actions"
                    >
                        <div className="sidebar-user-avatar">
                            {user.name?.charAt(0).toUpperCase()}
                        </div>
                        {!collapsed && (
                            <>
                                <div className="sidebar-user-info">
                                    <p className="sidebar-user-name">{user.name}</p>
                                    <p className="sidebar-user-email">{user.email}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div onClick={(e) => e.stopPropagation()}>
                                        <ThemeToggle className="sidebar-user-logout" />
                                    </div>
                                </div>

                                {/* Drop-up Menu */}
                                {showLogout && (
                                    <div 
                                        className="absolute bottom-full left-0 mb-2 w-full bg-elevated border border-theme rounded-lg shadow-xl shadow-black/20 overflow-hidden z-[100]"
                                    >
                                        <button
                                            className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium text-red-500 hover:bg-zinc-800/50 transition-colors"
                                            onClick={(e) => { e.stopPropagation(); logout(); }}
                                            aria-label="Sign out"
                                            title="Sign out"
                                        >
                                            <LogOut size={16} />
                                            <span>Sign out</span>
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>




        </aside>
        </>
    );
}
