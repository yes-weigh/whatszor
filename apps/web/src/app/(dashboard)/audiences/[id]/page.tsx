'use client';

import * as React from 'react';
import { Header } from '@/components/layout/Header';
import { useAudienceDetail } from '@/hooks/useAudiences';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Users2, Trash2, MapPin, RefreshCw, Mail, Phone, Globe } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import type { AudienceMember } from '@/lib/audience.api';

export default function AudienceDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    // Unwrap params in newer Next.js or just read directly
    const id = params.id;
    const { audience, members, isLoading, isSyncing, syncFromLeadList, removeMembers } = useAudienceDetail(id);

    const columns: ColumnDef<AudienceMember>[] = [
        {
            accessorKey: "contact",
            header: "Name",
            cell: ({ row }) => {
                const contact = row.original.contact;
                const isLocked = contact.customData?.isLocked;
                
                if (isLocked) {
                    return (
                        <div className="flex items-center gap-3 select-none pointer-events-none">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                <Users2 size={14} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-primary blur-sm">Locked Lead Name</span>
                                <span className="text-xs text-accent font-medium">Premium</span>
                            </div>
                        </div>
                    );
                }

                const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-accent/10 text-accent border border-accent/20">
                            {name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-primary">{name}</span>
                    </div>
                );
            },
        },
        {
            accessorKey: "contact.phone",
            header: "Phone",
            cell: ({ row }) => {
                const isLocked = row.original.contact.customData?.isLocked;
                if (isLocked) {
                    return (
                        <div className="flex items-center gap-2 text-sm text-secondary select-none pointer-events-none">
                            <Phone size={14} className="text-muted" />
                            <span className="blur-sm">+1 (XXX) XXX-XXXX</span>
                        </div>
                    );
                }
                return (
                    <div className="flex items-center gap-2 text-sm text-secondary">
                        <Phone size={14} className="text-muted" />
                        {row.original.contact.phone || "—"}
                    </div>
                );
            },
        },
        {
            accessorKey: "contact.email",
            header: "Email",
            cell: ({ row }) => {
                const isLocked = row.original.contact.customData?.isLocked;
                if (isLocked) {
                    return (
                        <div className="flex items-center gap-2 text-sm text-secondary select-none pointer-events-none">
                            <Mail size={14} className="text-muted" />
                            <span className="blur-sm">locked@hidden.com</span>
                        </div>
                    );
                }
                return (
                    <div className="flex items-center gap-2 text-sm text-secondary">
                        <Mail size={14} className="text-muted" />
                        {row.original.contact.email || "—"}
                    </div>
                );
            },
        },
        {
            accessorKey: "sourceType",
            header: "Source",
            cell: ({ row }) => {
                const type = row.original.sourceType;
                if (type === 'lead_list') {
                    return (
                        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <MapPin size={10} />
                            Lead List
                        </span>
                    );
                }
                return (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                        <Users2 size={10} />
                        Manual
                    </span>
                );
            },
        },
        {
            id: "actions",
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10 h-8 px-2"
                        onClick={() => {
                            if (confirm('Remove this contact from the audience?')) {
                                removeMembers([row.original.contact.id]);
                            }
                        }}
                    >
                        <Trash2 size={14} />
                    </Button>
                </div>
            ),
        },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
        );
    }

    if (!audience) {
        return (
            <div className="p-8 text-center text-secondary">
                Audience not found.
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen">
            <Header 
                title={audience.name} 
                subtitle={audience.description || "Manage audience members"} 
            />
            
            <div className="p-6 md:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <Button variant="ghost" onClick={() => router.push('/audiences')} className="pl-0 text-muted hover:text-primary">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Audiences
                    </Button>

                    <div className="flex items-center gap-2">
                        {audience.sourceType === 'lead_list' && (
                            <Button 
                                variant="secondary" 
                                onClick={() => syncFromLeadList(audience.leadListId || undefined)} 
                                disabled={isSyncing}
                                className="gap-2"
                            >
                                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                                Sync from Lead List
                            </Button>
                        )}
                    </div>
                </div>

                {members.some(m => m.contact.customData?.isLocked) && (
                    <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-accent/20 text-accent rounded-lg shrink-0">
                                <Users2 size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-primary text-sm flex items-center gap-2">
                                    Unlock Premium Leads
                                </h3>
                                <p className="text-sm text-secondary mt-1">
                                    Your daily lead extraction limit has been reached. Some contacts in this audience are locked and blurred. Upgrade your plan to reveal their details and continue finding contacts.
                                </p>
                            </div>
                        </div>
                        <Button 
                            variant="accent" 
                            className="shrink-0 w-full md:w-auto mt-2 md:mt-0"
                            onClick={() => router.push('/settings?tab=billing')}
                        >
                            Upgrade Plan
                        </Button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-2xl border border-theme bg-elevated shadow-sm flex flex-col gap-2">
                        <span className="text-sm text-secondary font-medium items-center flex gap-1.5"><Users2 size={16} /> Total Members</span>
                        <span className="text-3xl font-bold text-accent">{audience.memberCount}</span>
                    </div>
                    {audience.sourceType === 'lead_list' && audience.leadList && (
                        <div className="col-span-1 md:col-span-2 p-6 rounded-2xl border border-theme bg-elevated shadow-sm flex flex-col gap-2 relative overflow-hidden">
                            <span className="text-sm text-secondary font-medium items-center flex gap-1.5"><MapPin size={16} /> Linked Lead List</span>
                            <span className="text-xl font-bold text-primary truncate max-w-[80%]">
                                {audience.leadList.name || audience.leadList.query}
                            </span>
                            <Globe size={100} className="absolute -right-4 -bottom-4 text-theme opacity-30" />
                        </div>
                    )}
                </div>

                <div className="animate-in fade-in duration-500 pt-4">
                    <DataTable 
                        columns={columns} 
                        data={members} 
                        // Tanstack table filtering needs a direct accessor key that resolves to string
                        // For nested contact.firstName we might need to handle it in column def
                        // but since DataTable uses table.getColumn(searchKey), we'll disable simple string search 
                        // or just rely on pagination if we don't implement deep key searching in standard DataTable.
                    />
                </div>
            </div>
        </div>
    );
}
