'use client';

import * as React from 'react';
import { Header } from '@/components/layout/Header';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { AudienceListTab } from './components/AudienceListTab';
import { LeadSearchTab } from './components/LeadSearchTab';

function AudiencesContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    
    // Check if the parameter exists first, otherwise default to audiences
    const tabString = searchParams?.get('tab') || 'audiences';
    const activeTab = tabString === 'leads' ? 'leads' : 'audiences';

    const setTab = (tab: 'audiences' | 'leads') => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.set('tab', tab);
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="p-6 md:p-8 space-y-6">
            
            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-theme mb-6">
                <button
                    onClick={() => setTab('audiences')}
                    className={`pb-3 text-sm font-semibold transition-colors relative ${
                        activeTab === 'audiences' 
                            ? 'text-accent border-b-2 border-accent' 
                            : 'text-secondary hover:text-primary'
                    }`}
                >
                    Audiences
                </button>
                <button
                    onClick={() => setTab('leads')}
                    className={`pb-3 text-sm font-semibold transition-colors relative ${
                        activeTab === 'leads' 
                            ? 'text-accent border-b-2 border-accent' 
                            : 'text-secondary hover:text-primary'
                    }`}
                >
                    Lead Search
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'audiences' && <AudienceListTab />}
            {activeTab === 'leads' && <LeadSearchTab />}

        </div>
    );
}

export default function AudiencesPage() {
    return (
        <div className="flex flex-col min-h-screen">
            <Header 
                title="Outreach Hub" 
                subtitle="Manage your audiences and generate new leads in one place" 
            />
            <React.Suspense fallback={null}>
                <AudiencesContent />
            </React.Suspense>
        </div>
    );
}
