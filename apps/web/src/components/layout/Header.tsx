'use client';

import { useEffect } from 'react';
import { Search, Bell } from 'lucide-react';
import styles from './Header.module.css';
import { useMobileHeader } from '@/context/MobileHeaderContext';

interface HeaderProps {
    title: string;
    subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
    const { setHeader } = useMobileHeader();

    // Sync this page's title to the mobile top bar
    useEffect(() => {
        setHeader(title, subtitle);
    }, [title, subtitle]);

    return (
        <header className={styles.header}>
            <div>
                <h1 className={styles.title}>{title}</h1>
                {subtitle && (
                    <p className={styles.subtitle}>{subtitle}</p>
                )}
            </div>

            <div className={styles.actions}>
                {/* Search */}
                <div className={styles.searchWrapper}>
                    <Search size={15} className={styles.searchIcon} />
                    <input
                        className={styles.searchInput}
                        placeholder="Search workspace..."
                    />
                </div>

                {/* Divider */}
                <div className={styles.divider} />

                {/* Notifications */}
                <button
                    aria-label="Notifications"
                    className={styles.iconBtn}
                >
                    <Bell size={17} />
                    <span className={styles.notifDot} />
                </button>
            </div>
        </header>
    );
}
