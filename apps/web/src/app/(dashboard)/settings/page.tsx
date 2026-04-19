'use client';

import { Header } from '@/components/layout/Header';
import { useState, useEffect, Suspense } from 'react';
import { useAuthStore } from '@/store/auth';
import { Settings as SettingsIcon, MessageCircle, Bot, CreditCard, Users, Shield } from 'lucide-react';
import { GeneralTab } from './components/GeneralTab';
import { WhatsAppTab } from './components/WhatsAppTab';
import { MembersTab } from './components/MembersTab';
import { KnowledgeBotTab } from './components/KnowledgeBotTab';
import { BillingTab } from './components/BillingTab';
import { useRouter, useSearchParams } from 'next/navigation';

type Tab = 'general' | 'whatsapp' | 'ai' | 'billing' | 'members' | 'knowledgebot';

const tabs: { id: Tab; label: string; icon: any; externalHref?: string }[] = [
    { id: 'general',      label: 'General',       icon: SettingsIcon },
    { id: 'whatsapp',     label: 'WhatsApp',       icon: MessageCircle },
    { id: 'ai',           label: 'AI Config',      icon: Bot },
    { id: 'members',      label: 'Team',           icon: Users },
    { id: 'knowledgebot', label: 'Knowledge Bot',  icon: Shield },
    { id: 'billing',      label: 'Billing',        icon: CreditCard },
];

function SettingsPage() {
    const hasPermission = useAuthStore(s => s.hasPermission);
    const router = useRouter();
    const searchParams = useSearchParams();
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const filteredTabs = tabs.filter(tab => {
        if (tab.id === 'whatsapp')     return hasPermission('workspace:manage');
        if (tab.id === 'billing')      return hasPermission('billing:manage');
        if (tab.id === 'members')      return hasPermission('members:read');
        if (tab.id === 'knowledgebot') return hasPermission('workspace:manage');
        return true;
    });

    // Resolve initial tab from URL query param, falling back to first accessible tab
    const getDefaultTab = (): Tab => {
        const fromUrl = searchParams.get('tab') as Tab | null;
        if (fromUrl && filteredTabs.some(t => t.id === fromUrl)) return fromUrl;
        if (filteredTabs.some(t => t.id === 'whatsapp')) return 'whatsapp';
        return filteredTabs[0]?.id || 'general';
    };

    const [activeTab, setActiveTab] = useState<Tab>(getDefaultTab);

    // When the URL ?tab param changes externally (browser back/fwd, router.push), sync state
    useEffect(() => {
        const fromUrl = searchParams.get('tab') as Tab | null;
        if (fromUrl && filteredTabs.some(t => t.id === fromUrl) && fromUrl !== activeTab) {
            setActiveTab(fromUrl);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    if (!mounted) return null;

    const tabContent = (
        <>
            {activeTab === 'general'      && <GeneralTab />}
            {activeTab === 'whatsapp'     && <WhatsAppTab />}
            {activeTab === 'ai'           && <div className="flex items-center justify-center h-40 text-muted text-sm">AI Configuration coming soon...</div>}
            {activeTab === 'billing'      && <BillingTab />}
            {activeTab === 'members'      && <MembersTab />}
            {activeTab === 'knowledgebot' && <KnowledgeBotTab />}
        </>
    );

    const handleTabClick = (tab: typeof tabs[number]) => {
        if (tab.externalHref) {
            router.push(tab.externalHref);
        } else {
            setActiveTab(tab.id);
            // Sync the URL so deep-links and back-button work
            router.replace(`/settings?tab=${tab.id}`, { scroll: false });
        }
    };

    return (
        <div className="flex flex-col h-full bg-body">
            <Header title="Settings" subtitle="Manage your workspace preferences" />

            {/* ── Mobile: horizontal scrollable icon tab bar ── */}
            <div className="md:hidden border-b border-theme bg-surface shrink-0">
                <div className="flex overflow-x-auto scrollbar-none px-2 py-2 gap-1">
                    {filteredTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab)}
                            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors shrink-0 min-w-[64px] ${
                                activeTab === tab.id && !tab.externalHref
                                    ? 'bg-accent text-black'
                                    : 'text-secondary hover:bg-elevated hover:text-primary'
                            }`}
                        >
                            <tab.icon size={18} />
                            <span className="leading-tight text-center">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Mobile: Full-width content ── */}
            <div className="md:hidden flex-1 overflow-y-auto p-4">
                {tabContent}
            </div>

            {/* ── Desktop: sidebar + content ── */}
            <div className="hidden md:flex flex-1 overflow-hidden p-6 gap-6 max-w-7xl mx-auto w-full">
                {/* Sidebar Navigation */}
                <div className="w-64 shrink-0 flex flex-col gap-1">
                    {filteredTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === tab.id && !tab.externalHref
                                    ? 'bg-accent text-black'
                                    : 'text-secondary hover:bg-elevated hover:text-primary'
                            }`}
                        >
                            <tab.icon size={18} />
                            {tab.label === 'AI Config' ? 'AI Configuration' : tab.label === 'Team' ? 'Team Members' : tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 bg-surface border border-theme rounded-xl p-6 overflow-y-auto shadow-sm">
                    {tabContent}
                </div>
            </div>
        </div>
    );
}

export default function SettingsPageWrapper() {
    return (
        <Suspense fallback={null}>
            <SettingsPage />
        </Suspense>
    );
}
