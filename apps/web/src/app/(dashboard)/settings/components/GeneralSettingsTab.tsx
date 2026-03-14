'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Settings, Loader2, Check, Globe, Clock } from 'lucide-react';
import { useAsyncAction } from '@/hooks/use-async-action';

const TIMEZONES = [
    'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
    'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago',
    'America/Los_Angeles', 'Australia/Sydney',
];

export function GeneralSettingsTab() {
    const qc = useQueryClient();

    const { data: workspace, isLoading } = useQuery({
        queryKey: ['workspace-settings'],
        queryFn: () => api.get('/workspaces/me').then(r => r.data?.data ?? r.data),
    });

    const [name, setName] = useState('');
    const [timezone, setTimezone] = useState('');
    const [initialized, setInitialized] = useState(false);

    // Sync state once workspace data loads
    if (workspace && !initialized) {
        setName(workspace.name ?? '');
        setTimezone(workspace.timezone ?? 'UTC');
        setInitialized(true);
    }

    const { isLoading: saving, execute: executeSave } = useAsyncAction();

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            return;
        }
        await executeSave(
            () => api.patch('/workspaces/me', { name: name.trim(), timezone }),
            {
                successMessage: 'Settings saved',
                errorMessage: 'Failed to save settings',
                onSuccess: () => {
                    qc.invalidateQueries({ queryKey: ['workspace-settings'] });
                }
            }
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={28} className="animate-spin text-muted" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 max-w-xl">
            <div>
                <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                    <Settings size={20} className="text-accent" />
                    General Settings
                </h2>
                <p className="text-sm text-muted mt-1">
                    Configure your workspace identity and regional preferences.
                </p>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-5">
                {/* Workspace Name */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                        <Globe size={12} />
                        Workspace Name
                    </label>
                    <input
                        className="input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. YesWeigh Sales"
                        maxLength={80}
                        required
                    />
                    <p className="text-[11px] text-muted">
                        This name appears in notifications, emails, and reports.
                    </p>
                </div>

                {/* Timezone */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                        <Clock size={12} />
                        Timezone
                    </label>
                    <select
                        title="Workspace timezone"
                        className="input"
                        value={timezone}
                        onChange={e => setTimezone(e.target.value)}
                    >
                        {TIMEZONES.map(tz => (
                            <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                        ))}
                    </select>
                    <p className="text-[11px] text-muted">
                        Used for scheduled campaigns and timestamps in reports.
                    </p>
                </div>

                {/* Read-only workspace slug */}
                {workspace?.slug && (
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
                            Workspace Slug
                        </label>
                        <div className="input bg-elevated text-muted cursor-not-allowed select-all font-mono text-sm">
                            {workspace.slug}
                        </div>
                        <p className="text-[11px] text-muted">
                            Used for the login URL. Cannot be changed after creation.
                        </p>
                    </div>
                )}

                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        {saving
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Check size={16} />}
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
}
