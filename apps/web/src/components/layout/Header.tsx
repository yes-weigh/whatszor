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
        <header style={{
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingInline: '1.5rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            position: 'sticky',
            top: 0,
            zIndex: 30,
        }}>
            <div>
                <h1 style={{
                    fontWeight: 600,
                    fontSize: '1.0625rem',
                    color: 'var(--text-primary)',
                    margin: 0,
                    lineHeight: 1.3,
                }}>{title}</h1>
                {subtitle && (
                    <p style={{
                        fontSize: '0.8125rem',
                        color: 'var(--text-muted)',
                        margin: 0,
                        lineHeight: 1.3,
                    }}>{subtitle}</p>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Search */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                }}>
                    <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <input
                        style={{
                            background: 'transparent',
                            fontSize: '0.8125rem',
                            outline: 'none',
                            width: '180px',
                            color: 'var(--text-primary)',
                            border: 'none',
                            fontFamily: 'inherit',
                        }}
                        placeholder="Search workspace..."
                        onFocus={e => {
                            const wrapper = e.currentTarget.parentElement!;
                            wrapper.style.borderColor = 'var(--border-strong)';
                            wrapper.style.boxShadow = '0 0 0 1px var(--border-strong)';
                        }}
                        onBlur={e => {
                            const wrapper = e.currentTarget.parentElement!;
                            wrapper.style.borderColor = 'var(--border)';
                            wrapper.style.boxShadow = 'none';
                        }}
                    />
                </div>

                {/* Divider */}
                <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

                {/* Notifications */}
                <button
                    aria-label="Notifications"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        border: '1px solid transparent',
                        background: 'transparent',
                        cursor: 'pointer',
                        position: 'relative',
                        color: 'var(--text-secondary)',
                        transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                    }}
                >
                    <Bell size={17} />
                    <span style={{
                        position: 'absolute',
                        top: '7px',
                        right: '7px',
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        boxShadow: '0 0 6px var(--accent-glow)',
                        animation: 'badge-pulse 2s ease-in-out infinite',
                    }} />
                </button>

                {/* Logout */}
                <button
                    aria-label="Log out"
                    onClick={logout}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        border: '1px solid transparent',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.08)';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.2)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                    }}
                >
                    <LogOut size={17} />
                </button>
            </div>
        </header>
    );
}
