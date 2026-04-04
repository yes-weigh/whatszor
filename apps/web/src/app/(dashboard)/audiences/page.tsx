'use client';

import * as React from 'react';
import { Header } from '@/components/layout/Header';
import { useAudiences } from '@/hooks/useAudiences';
import { Button } from '@/components/ui/Button';
import {
    Users2,
    Plus,
    Trash2,
    MapPin,
    User,
    Loader2,
    ChevronRight,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import type { Audience } from '@/lib/audience.api';

export default function AudiencesPage() {
    const router = useRouter();
    const { audiences, total, isLoading, createAudience, deleteAudience } = useAudiences();

    const [showCreate, setShowCreate] = React.useState(false);
    const [name, setName] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [isCreating, setIsCreating] = React.useState(false);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setIsCreating(true);
        try {
            await createAudience({ name: name.trim(), description: description.trim() || undefined });
            setName('');
            setDescription('');
            setShowCreate(false);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (audience: Audience) => {
        if (!confirm(`Delete audience "${audience.name}"? Campaigns linked to it will lose the reference, but already-snapshotted members are unaffected.`)) return;
        await deleteAudience(audience.id, audience.name);
    };

    const columns: ColumnDef<Audience>[] = [
        {
            accessorKey: 'name',
            header: 'Audience Name',
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-primary">{row.original.name}</span>
                    {row.original.description && (
                        <span className="text-xs text-muted truncate max-w-xs">{row.original.description}</span>
                    )}
                </div>
            ),
        },
        {
            accessorKey: 'memberCount',
            header: 'Members',
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-accent">{row.original.memberCount}</span>
                    <span className="text-xs text-muted">contacts</span>
                </div>
            ),
        },
        {
            accessorKey: 'sourceType',
            header: 'Source',
            cell: ({ row }) => {
                const type = row.original.sourceType;
                if (type === 'lead_list') {
                    return (
                        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <MapPin size={10} />
                            Lead List
                            {row.original.leadList && (
                                <span className="text-blue-300/70 truncate max-w-[120px]">
                                    — {row.original.leadList.name || row.original.leadList.query}
                                </span>
                            )}
                        </span>
                    );
                }
                return (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                        <User size={10} />
                        Manual
                    </span>
                );
            },
        },
        {
            accessorKey: 'createdAt',
            header: 'Created',
            cell: ({ row }) => (
                <span className="text-xs text-muted">
                    {new Date(row.original.createdAt).toLocaleDateString()}
                </span>
            ),
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
                <div className="flex items-center justify-end gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted hover:text-accent gap-1.5"
                        onClick={() => router.push(`/audiences/${row.original.id}`)}
                    >
                        Manage
                        <ChevronRight size={12} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => handleDelete(row.original)}
                    >
                        <Trash2 size={14} />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="flex flex-col min-h-screen">
            <Header
                title="Audiences"
                subtitle={`${total} audience${total !== 1 ? 's' : ''} — reusable contact segments for targeted campaigns`}
            />

            <div className="p-6 md:p-8 space-y-6">

                {/* Hero stats + CTA */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="col-span-1 md:col-span-2 p-6 rounded-2xl border border-theme bg-elevated shadow-sm flex items-center gap-6">
                        <div className="w-14 h-14 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                            <Users2 size={24} className="text-accent" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-primary">{total} Audiences</h2>
                            <p className="text-sm text-secondary mt-0.5">
                                Group contacts from lead lists or manual selection, then target them in campaigns with one click.
                            </p>
                        </div>
                    </div>
                    <div className="p-6 rounded-2xl border border-theme bg-elevated shadow-sm flex flex-col items-center justify-center gap-3">
                        <Button
                            variant="accent"
                            className="w-full gap-2"
                            onClick={() => setShowCreate(true)}
                        >
                            <Plus size={16} />
                            New Audience
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full gap-2 text-secondary"
                            onClick={() => router.push('/leads')}
                        >
                            <MapPin size={14} />
                            Import from Lead List
                        </Button>
                    </div>
                </div>

                {/* Create modal */}
                {showCreate && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-surface border border-theme rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
                            <h3 className="text-lg font-semibold text-primary mb-4">Create Audience</h3>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-secondary uppercase tracking-wide">
                                        Audience Name *
                                    </label>
                                    <input
                                        id="audience-name-input"
                                        autoFocus
                                        className="w-full rounded-lg border border-theme bg-elevated px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                                        placeholder="e.g. Bakeries in Vyttila"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-secondary uppercase tracking-wide">
                                        Description (optional)
                                    </label>
                                    <textarea
                                        id="audience-description-input"
                                        className="w-full rounded-lg border border-theme bg-elevated px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                                        placeholder="What is this audience for?"
                                        rows={2}
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                    />
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" variant="accent" disabled={isCreating || !name.trim()}>
                                        {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus size={14} />}
                                        Create
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Table */}
                {isLoading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-accent" />
                    </div>
                ) : audiences.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-4 text-center border border-dashed border-theme rounded-2xl">
                        <Users2 className="h-12 w-12 text-muted/40" />
                        <div>
                            <p className="text-sm font-medium text-secondary">No audiences yet</p>
                            <p className="text-xs text-muted mt-1">
                                Create an audience or convert a lead list to get started.
                            </p>
                        </div>
                        <Button variant="accent" size="sm" onClick={() => setShowCreate(true)}>
                            <Plus size={14} className="mr-1.5" />
                            Create Audience
                        </Button>
                    </div>
                ) : (
                    <div className="animate-in fade-in duration-300">
                        <DataTable columns={columns} data={audiences} searchKey="name" />
                    </div>
                )}
            </div>
        </div>
    );
}
