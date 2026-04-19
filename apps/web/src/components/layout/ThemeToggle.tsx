'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ThemeToggleProps {
    className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Prevent hydration mismatch — render only after mount
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    const isDark = theme === 'dark';
    const toggle = () => setTheme(isDark ? 'light' : 'dark');

    return (
        <button
            type="button"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
            onClick={toggle}
            className={className || "sidebar-user-logout"}
        >
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
        </button>
    );
}
