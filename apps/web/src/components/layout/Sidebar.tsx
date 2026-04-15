'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    MessageSquare, Users, Users2, Megaphone, Zap, LayoutDashboard,
    Settings, Image, LayoutTemplate, MapPin,
    LogOut, PanelLeftClose, PanelLeft
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
export function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    const { user, hasPermission, logout } = useAuthStore();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => { setIsMounted(true); }, []);

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

    const isActive = (href: string) =>
        pathname === href || pathname.startsWith(href + '/');

    return (
        <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : 'sidebar--expanded'}`}>

            {/* ── Workspace header (branding + switcher) ─────────────────── */}
            <div className="sidebar-header" onClick={() => collapsed && setCollapsed(false)}>
                <div className="sidebar-logo-mark">
                    <NextImage src="/logo.png" alt="WhatsVue" width={18} height={18} className="object-contain" />
                </div>
                {!collapsed && (
                    <>
                        <div className="sidebar-workspace-info">
                            <span className="sidebar-workspace-name">WhatsVue</span>
                            <span className="sidebar-workspace-plan">Pro</span>
                        </div>
                        <button 
                            className="sidebar-collapse-btn" 
                            aria-label="Collapse sidebar"
                            title="Collapse sidebar"
                            onClick={(e) => { e.stopPropagation(); setCollapsed(true); }}
                        >
                            <PanelLeftClose size={15} />
                        </button>
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
                            {!collapsed && (
                                <span className="sidebar-section-label">{label}</span>
                            )}
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

                <ThemeToggle collapsed={collapsed} />

                {isMounted && user && (
                    <div className="sidebar-user">
                        <div className="sidebar-user-avatar">
                            {user.name?.charAt(0).toUpperCase()}
                        </div>
                        {!collapsed && (
                            <>
                                <div className="sidebar-user-info">
                                    <p className="sidebar-user-name">{user.name}</p>
                                    <p className="sidebar-user-email">{user.email}</p>
                                </div>
                                <button
                                    className="sidebar-user-logout"
                                    onClick={() => logout()}
                                    aria-label="Sign out"
                                    title="Sign out"
                                >
                                    <LogOut size={13} />
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>




        </aside>
    );
}
