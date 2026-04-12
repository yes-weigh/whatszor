'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ThemeToggleProps {
    collapsed?: boolean;
}

export function ThemeToggle({ collapsed }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Prevent hydration mismatch — render only after mount
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    const isDark = theme === 'dark';

    const toggle = () => setTheme(isDark ? 'light' : 'dark');

    if (collapsed) {
        return (
            <button
                type="button"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDark ? 'Light mode' : 'Dark mode'}
                onClick={toggle}
                className="sidebar-nav-item"
            >
                {isDark
                    ? <Sun size={16} className="sidebar-nav-icon" />
                    : <Moon size={16} className="sidebar-nav-icon" />
                }
            </button>
        );
    }

    return (
        <button
            type="button"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggle}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '7px 10px',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontWeight: 450,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'color 100ms ease, background 100ms ease',
                gap: '0.625rem',
                textAlign: 'left',
                whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
        >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1 }}>
                {isDark
                    ? <Sun size={16} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                    : <Moon size={16} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                }
                <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
            </span>
            {/* Pill toggle indicator */}
            <span style={{
                display: 'inline-flex',
                width: '28px',
                height: '16px',
                borderRadius: '99px',
                background: isDark ? 'var(--bg-elevated)' : 'var(--accent)',
                border: '1px solid var(--border-strong)',
                alignItems: 'center',
                padding: '2px',
                transition: 'background 200ms ease',
                flexShrink: 0,
            }}>
                <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: isDark ? 'var(--text-muted)' : '#fff',
                    transform: isDark ? 'translateX(0)' : 'translateX(12px)',
                    transition: 'transform 200ms cubic-bezier(0.16,1,0.3,1), background 200ms ease',
                    flexShrink: 0,
                }} />
            </span>
        </button>
    );
}
