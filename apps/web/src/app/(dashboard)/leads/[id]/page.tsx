'use client';

import * as React from 'react';
import { Header } from '@/components/layout/Header';
import { useLeadGenerationDetail } from '@/hooks/useLeadGeneration';
import type { Lead } from '@/lib/leadGeneration.api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { 
    ArrowLeft,
    Phone,
    MapPin,
    Globe,
    CheckCircle2,
    XCircle,
    Loader2,
    AlertTriangle,
    Database,
    Users2,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { Lock } from 'lucide-react';

export default function LeadListDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id } = params;
    const [filter, setFilter] = React.useState<'all' | 'with_phone' | 'converted' | 'raw'>('all');
    const [createdAudienceId, setCreatedAudienceId] = React.useState<string | null>(null);

    const { 
        list, 
        leads, 
        isLoading, 
        convertLeads, 
        isConverting 
    } = useLeadGenerationDetail(id, filter);

    const handleConvertOnly = async () => {
        if (!confirm('Convert all available leads with phone numbers to CRM Contacts? Existing phones will be skipped.')) return;
        await convertLeads({ skipExisting: true });
        toast.success('Leads converted to contacts');
    };

    const handleConvertAndCreateAudience = async () => {
        if (!confirm('Convert leads to Contacts AND create a named Audience from them? This is the recommended flow for running targeted campaigns.')) return;
        const result = await convertLeads({ skipExisting: true, createAudience: true });
        if ((result as any)?.audienceId) {
            setCreatedAudienceId((result as any).audienceId);
            toast.success(`Converted ${(result as any)?.converted ?? 0} leads — Audience created!`);
        } else {
            toast.success('Leads converted to contacts');
        }
    };

    const columns: ColumnDef<Lead>[] = [
        {
            accessorKey: "name",
            header: "Name",
            cell: ({ row }) => {
                const isBlurred = row.original._isLocked === true;
                return (
                    <div className={`flex flex-col gap-0.5 ${isBlurred ? 'blur-sm select-none opacity-60' : ''}`}>
                        <span className="text-sm font-semibold text-primary">{row.getValue("name")}</span>
                        {row.original.googlePlaceId && !isBlurred && (
                            <span className="text-xs text-muted font-mono">{row.original.googlePlaceId.substring(0, 8)}...</span>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: "phone",
            header: "Phone / Contact",
            cell: ({ row }) => {
                const phone = row.getValue("phone") as string | null;
                const status = row.original.status;
                const hasPhone = row.original.hasPhone;

                const isBlurred = row.original._isLocked === true;

                if (!hasPhone) {
                    return <span className={`text-xs text-muted italic ${isBlurred ? 'blur-[2px] select-none opacity-60' : ''}`}>— No Phone —</span>;
                }

                return (
                    <div className={`flex flex-col gap-1 ${isBlurred ? 'blur-sm select-none opacity-60 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2 text-sm text-secondary">
                            <Phone size={14} className="text-muted" />
                            {phone}
                        </div>
                        {status === 'CONVERTED' && (
                            <span className="inline-flex items-center text-xs text-green-500 gap-1 rounded bg-green-500/10 px-1 py-0.5 max-w-max">
                                <CheckCircle2 size={12} /> Converted
                            </span>
                        )}
                        {status === 'SKIPPED' && (
                            <span className="inline-flex items-center text-xs text-yellow-500 gap-1 rounded bg-yellow-500/10 px-1 py-0.5 max-w-max">
                                <AlertTriangle size={12} /> Skipped
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: "address",
            header: "Address",
            cell: ({ row }) => {
                const address = row.getValue("address") as string | null;
                const isBlurred = row.original._isLocked === true;
                
                if (!address) return <span className="text-muted">—</span>;
                return (
                    <div className={`flex items-center gap-2 text-sm text-secondary max-w-xs truncate ${isBlurred ? 'blur-sm select-none opacity-60' : ''}`} title={address}>
                        <MapPin size={14} className="text-muted shrink-0" />
                        <span className="truncate">{address}</span>
                    </div>
                );
            },
        },
        {
            accessorKey: "website",
            header: "Website",
            cell: ({ row }) => {
                const website = row.getValue("website") as string | null;
                const isBlurred = row.original._isLocked === true;
                
                if (!website) return <span className="text-muted">—</span>;
                let displayHost = website;
                try {
                    displayHost = website === 'https://hidden.url' ? 'hidden.url' : new URL(website).hostname;
                } catch {
                    displayHost = website;
                }
                return (
                    <div className={`flex items-center gap-2 text-sm text-accent max-w-[200px] truncate ${isBlurred ? 'blur-sm select-none opacity-60 pointer-events-none text-muted' : 'hover:underline cursor-pointer'}`}>
                        <Globe size={14} className="shrink-0" />
                        <span className="truncate">{displayHost}</span>
                    </div>
                );
            },
        },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
        );
    }

    if (!list) {
        return (
            <div className="p-8 text-center text-secondary">
                Lead list not found.
            </div>
        );
    }

    const isProcessing = list.status === 'PROCESSING' || list.status === 'PENDING';
    const isFailed = list.status === 'FAILED';
    const blurredLeadsCount = leads?.filter(l => l._isLocked === true).length || 0;

    return (
        <div className="flex flex-col min-h-screen">
            <Header 
                title={list.name || "Lead List Details"} 
                subtitle={`Query: ${list.query}`} 
            />
            
            <div className="p-6 md:p-8 space-y-6">
                
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.push('/leads')} className="pl-0 text-muted hover:text-primary">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Lists
                    </Button>
                </div>

                {/* Status Hero Area */}
                {isProcessing && (
                    <div className="p-8 bg-blue-500/10 border border-blue-500/20 rounded-xl flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
                        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                        <div>
                            <h3 className="text-lg font-semibold text-blue-500">Generating Leads...</h3>
                            <p className="text-sm text-blue-500/80 mt-1">This takes a little while based on the location. Please wait, or close this tab and check back later.</p>
                        </div>
                    </div>
                )}

                {isFailed && (
                    <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col items-center justify-center text-center space-y-4">
                        <XCircle className="h-10 w-10 text-red-500" />
                        <div>
                            <h3 className="text-lg font-semibold text-red-500">Generation Failed</h3>
                            <p className="text-sm text-red-500/80 mt-1">{list.errorReason || 'An unknown server error occurred'}</p>
                        </div>
                    </div>
                )}

                {!isProcessing && !isFailed && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-6 rounded-xl border border-theme bg-elevated shadow-sm flex flex-col gap-2">
                                <span className="text-sm text-secondary font-medium">Total Found</span>
                                <span className="text-3xl font-bold text-primary">{list.totalFound}</span>
                            </div>
                            <div className="p-6 rounded-xl border border-theme bg-elevated shadow-sm flex flex-col gap-2">
                                <span className="text-sm text-secondary font-medium">With Phone Number</span>
                                <span className="text-3xl font-bold text-primary">{list.withPhone}</span>
                            </div>
                            <div className="p-6 rounded-xl border border-theme bg-elevated shadow-sm flex flex-col gap-2">
                                <span className="text-sm text-secondary font-medium">Converted to Contacts</span>
                                <span className="text-3xl font-bold text-accent">{list.converted}</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-theme">
                            <div className="flex items-center gap-2 bg-theme p-1 rounded-lg">
                                <Button 
                                    variant={filter === 'all' ? 'secondary' : 'ghost'} 
                                    size="sm" 
                                    className="text-xs"
                                    onClick={() => setFilter('all')}
                                >
                                    All Leads
                                </Button>
                                <Button 
                                    variant={filter === 'with_phone' ? 'secondary' : 'ghost'} 
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => setFilter('with_phone')}
                                >
                                    Has Phone
                                </Button>
                                <Button 
                                    variant={filter === 'converted' ? 'secondary' : 'ghost'} 
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => setFilter('converted')}
                                >
                                    Converted
                                </Button>
                                <Button 
                                    variant={filter === 'raw' ? 'secondary' : 'ghost'} 
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => setFilter('raw')}
                                >
                                    Raw
                                </Button>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Secondary: convert to contacts only */}
                                <Button
                                    variant="secondary"
                                    onClick={handleConvertOnly}
                                    disabled={list.withPhone === 0 || isConverting || list.withPhone === list.converted}
                                    className="gap-2 text-sm"
                                >
                                    {isConverting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Database className="h-4 w-4" />
                                    )}
                                    Contacts Only
                                </Button>

                                {/* Primary: convert + create audience */}
                                <Button
                                    variant="accent"
                                    onClick={handleConvertAndCreateAudience}
                                    disabled={list.withPhone === 0 || isConverting || list.withPhone === list.converted}
                                    className="gap-2"
                                >
                                    {isConverting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Users2 className="h-4 w-4" />
                                    )}
                                    {isConverting ? 'Converting...' : 'Convert & Create Audience'}
                                </Button>
                            </div>
                        </div>

                        {/* Audience created banner */}
                        {createdAudienceId && (
                            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm animate-in fade-in">
                                <div className="flex items-center gap-2">
                                    <Users2 size={16} />
                                    <span>Audience created from this lead list.</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-accent hover:text-accent/80 gap-1.5 text-xs"
                                    onClick={() => router.push(`/audiences/${createdAudienceId}`)}
                                >
                                    View Audience →
                                </Button>
                            </div>
                        )}

                        <div className="animate-in fade-in duration-500 relative">
                            {blurredLeadsCount > 0 && (
                                <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-background via-background/90 to-transparent z-10 flex flex-col items-center justify-end pb-8 pointer-events-none">
                                    <div className="bg-elevated/80 backdrop-blur-md border border-accent/20 shadow-2xl shadow-accent/5 p-6 rounded-2xl flex flex-col items-center text-center max-w-md pointer-events-auto">
                                        <div className="w-12 h-12 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-3">
                                            <Lock size={20} />
                                        </div>
                                        <h3 className="text-lg font-bold text-primary mb-1">
                                            {blurredLeadsCount} Leads Hidden
                                        </h3>
                                        <p className="text-sm text-muted mb-5">
                                            You've hit the view limit for the Free tier. Upgrade to Pro to see all found leads and export them directly to your CRM.
                                        </p>
                                        <Button variant="accent" className="w-full shadow-lg shadow-accent/20" onClick={() => router.push('/settings?tab=billing')}>
                                            Upgrade Subscription (₹999/mo)
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <DataTable 
                                columns={columns} 
                                data={leads} 
                                searchKey="name"
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
