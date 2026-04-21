'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Loader2, Save } from 'lucide-react';

export function GeneralTab() {
    const qc = useQueryClient();
    
    const [settings, setSettings] = useState({
        crm: {
            emailVisibility: true,
            productMapping: true
        },
        businessContext: ''
    });

    const { data: workspace, isLoading } = useQuery({
        queryKey: ['workspace-current'],
        queryFn: () => api.get('/workspaces/me').then(r => r.data),
    });

    useEffect(() => {
        if (workspace?.settings) {
            setSettings(s => ({
                ...s,
                crm: workspace.settings.crm ? { ...s.crm, ...workspace.settings.crm } : s.crm,
                businessContext: workspace.settings.businessContext || ''
            }));
        }
    }, [workspace]);

    const updateMutation = useMutation({
        mutationFn: (updatedSettings: any) => api.patch('/workspaces/me', { settings: updatedSettings }),
        onSuccess: () => {
             qc.invalidateQueries({ queryKey: ['workspace-current'] });
        }
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-muted" />
            </div>
        );
    }

    const saveSettings = () => {
        const payload = {
            ...(workspace?.settings || {}),
            crm: settings.crm,
            businessContext: settings.businessContext
        };
        updateMutation.mutate(payload);
    };

    return (
        <div className="flex flex-col gap-6 max-w-xl">
            <div>
                <h2 className="text-xl font-bold text-primary tracking-tight">General & CRM Settings</h2>
                <p className="text-sm text-muted mt-1">Manage global workspace behavioral preferences.</p>
            </div>

            <div className="flex flex-col gap-4 card bg-surface mt-2">
                <h3 className="font-semibold text-primary mb-2 border-b border-theme/50 pb-2">Business Profile & Context</h3>
                
                <div className="flex flex-col gap-2 p-3 rounded-xl border border-theme bg-body hover:bg-elevated transition-colors">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-primary">AI Business Context</span>
                        <span className="text-xs text-muted">This context allows Whatsvue&apos;s AI features to provide tailored solutions and suggestions for your specific business case. It is automatically populated during your initial onboarding chat.</span>
                    </div>
                    <textarea 
                        className="w-full bg-surface border border-theme rounded-lg px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent min-h-[150px] resize-y mt-2 scrollbar-thin"
                        placeholder="e.g. We are a B2B SaaS startup based in Bangalore, providing software for real estate agencies. Out target audience is mid-sized firms."
                        value={settings.businessContext}
                        onChange={e => setSettings(s => ({ ...s, businessContext: e.target.value }))}
                    />
                </div>
            </div>

            <div className="flex flex-col gap-4 card bg-surface">
                <h3 className="font-semibold text-primary mb-2 border-b border-theme/50 pb-2">CRM Configuration</h3>
                
                <label className="flex items-center justify-between p-3 rounded-xl border border-theme bg-body hover:bg-elevated transition-colors cursor-pointer">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-primary">Enable Product Mapping</span>
                        <span className="text-xs text-muted">Allow team to deeply link SaaS products directly to Contacts.</span>
                    </div>
                    <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded bg-theme border-theme text-accent focus:ring-accent"
                        checked={settings.crm.productMapping}
                        onChange={e => setSettings(s => ({ ...s, crm: { ...s.crm, productMapping: e.target.checked } }))}
                    />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-theme bg-body hover:bg-elevated transition-colors cursor-pointer">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-primary">Public Email Visibility</span>
                        <span className="text-xs text-muted">Display Contact email addresses inside detail views.</span>
                    </div>
                    <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded bg-theme border-theme text-accent focus:ring-accent"
                        checked={settings.crm.emailVisibility}
                        onChange={e => setSettings(s => ({ ...s, crm: { ...s.crm, emailVisibility: e.target.checked } }))}
                    />
                </label>

                <div className="flex justify-end mt-4">
                    <button 
                        className="btn btn-primary flex items-center gap-2"
                        onClick={saveSettings}
                        disabled={updateMutation.isPending}
                    >
                        {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
