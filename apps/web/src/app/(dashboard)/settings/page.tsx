'use client';

import { Header } from '@/components/layout/Header';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { Settings as SettingsIcon, MessageCircle, Bot, CreditCard, Users, Shield } from 'lucide-react';
import { GeneralTab } from './components/GeneralTab';
import { WhatsAppTab } from './components/WhatsAppTab';
import { MembersTab } from './components/MembersTab';
import { KnowledgeBotTab } from './components/KnowledgeBotTab';
import { useRouter } from 'next/navigation';

type Tab = 'general' | 'whatsapp' | 'ai' | 'billing' | 'members' | 'knowledgebot';

const tabs: { id: Tab; label: string; icon: any; externalHref?: string }[] = [
    { id: 'general',      label: 'General',          icon: SettingsIcon },
    { id: 'whatsapp',     label: 'WhatsApp',          icon: MessageCircle },
    { id: 'ai',           label: 'AI Configuration',  icon: Bot },
    { id: 'members',      label: 'Team Members',      icon: Users },
    { id: 'knowledgebot', label: 'Knowledge Bot',     icon: Shield },
    { id: 'billing',      label: 'Billing',           icon: CreditCard },
];


export default function SettingsPage() {
    const hasPermission = useAuthStore(s => s.hasPermission);
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const filteredTabs = tabs.filter(tab => {
        if (tab.id === 'whatsapp')     return hasPermission('workspace:manage');
        if (tab.id === 'billing')      return hasPermission('billing:manage');
        if (tab.id === 'members')      return hasPermission('members:read');
        if (tab.id === 'knowledgebot') return hasPermission('workspace:manage');
        return true;
    });

    const [activeTab, setActiveTab] = useState<Tab>(
        filteredTabs.find(t => t.id === 'whatsapp') ? 'whatsapp' : (filteredTabs[0]?.id || 'general')
    );

    if (!mounted) return null;

    return (
        <div className="flex flex-col h-full bg-body">
            <Header title="Settings" subtitle="Manage your workspace preferences" />
            
            <div className="flex flex-1 overflow-hidden p-6 gap-6 max-w-7xl mx-auto w-full">
                {/* Sidebar Navigation for Settings */}
                <div className="w-64 shrink-0 flex flex-col gap-1">
                    {filteredTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => tab.externalHref ? router.push(tab.externalHref) : setActiveTab(tab.id)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === tab.id && !tab.externalHref
                                    ? 'bg-primary text-white' 
                                    : 'text-secondary hover:bg-elevated hover:text-primary'
                            }`}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 bg-surface border border-theme rounded-xl p-6 overflow-y-auto shadow-sm">
                    {activeTab === 'general' && <GeneralTab />}
                    
                    {activeTab === 'whatsapp' && <WhatsAppTab />}
                    {activeTab === 'ai' && (
                        <div className="flex items-center justify-center h-full text-muted">
                            AI Configuration and Prompts coming soon...
                        </div>
                    )}
                    
                    {activeTab === 'billing' && (
                        <div className="flex items-center justify-center h-full text-muted">
                            Billing capabilities coming soon...
                        </div>
                    )}

                    {activeTab === 'members'      && <MembersTab />}
                    {activeTab === 'knowledgebot' && <KnowledgeBotTab />}
                </div>
            </div>
        </div>
    );
}
