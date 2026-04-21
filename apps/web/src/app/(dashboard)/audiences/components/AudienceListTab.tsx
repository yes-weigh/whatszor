'use client';

import * as React from 'react';
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

export function AudienceListTab() {
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
            header: 'Size',
            cell: ({ row }) => {
                const count = row.original.memberCount || 0;
                return (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium border border-accent/20">
                        <User size={12} />
                        {count} {count === 1 ? 'member' : 'members'}
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
            cell: ({ row }) => {
                return (
                    <div className="flex justify-end gap-2 text-right">
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8 gap-1"
                            onClick={() => router.push(`/audiences/${row.original.id}`)}
                        >
                            View <ChevronRight size={14} />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            onClick={() => handleDelete(row.original)}
                        >
                            <Trash2 size={14} />
                        </Button>
                    </div>
                );
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 p-6 rounded-2xl border border-theme bg-elevated shadow-sm flex items-center justify-between">
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
                        onClick={() => router.push('/audiences?tab=leads')}
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
    );
}
