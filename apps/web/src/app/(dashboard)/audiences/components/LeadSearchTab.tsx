'use client';

import * as React from 'react';
import { useLeadGenerationLists } from '@/hooks/useLeadGeneration';
import type { LeadList } from '@/lib/leadGeneration.api';
import { leadGenerationApi } from '@/lib/leadGeneration.api';
import { useRouter } from 'next/navigation';
import {
    MapPin,
    MoreHorizontal,
    Loader2,
    Brain,
    Search,
    Sparkles,
    CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/Dropdown';
import { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';

// ─── Toast ────────────────────────────────────────────────────────────────────
interface ToastState {
    message: string;
    type: 'loading' | 'success' | 'error';
    detail?: string;
}

export function LeadSearchTab() {
    const router = useRouter();
    const { lists, deleteLeadList, refetch } = useLeadGenerationLists();

    const [query, setQuery] = React.useState('');
    const [isSearching, setIsSearching] = React.useState(false);
    const [toast, setToast] = React.useState<ToastState | null>(null);

    const showToast = (t: ToastState, autoDismissMs?: number) => {
        setToast(t);
        if (autoDismissMs) setTimeout(() => setToast(null), autoDismissMs);
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const q = query.trim();
        if (!q || isSearching) return;

        setIsSearching(true);
        showToast({ type: 'loading', message: 'Analysing your search…', detail: 'AI is expanding keywords' });

        try {
            const result = await leadGenerationApi.smartSearch(q);

            showToast({
                type: 'success',
                message: `🧠 Searching across ${result.totalSearches} keyword variations in ${result.city}`,
                detail: result.synonymsUsed.slice(0, 3).join(', ') + (result.synonymsUsed.length > 3 ? ` +${result.synonymsUsed.length - 3} more` : ''),
            }, 6000);

            setQuery('');
            // Refresh table after a moment to show new rows
            setTimeout(() => refetch?.(), 2000);
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Search failed';
            showToast({ type: 'error', message: msg }, 5000);
        } finally {
            setIsSearching(false);
        }
    };

    const columns: ColumnDef<LeadList>[] = [
        {
            accessorKey: 'query',
            header: 'Search Query',
            cell: ({ row }) => {
                const list = row.original;
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-accent/10 text-accent border border-accent/20">
                            <MapPin size={16} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-primary">{list.query}</span>
                            <span className="text-xs text-muted">{list.name || 'Unnamed List'}</span>
                        </div>
                    </div>
                );
            },
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const status = row.getValue('status') as string;
                const map: Record<string, string> = {
                    READY: 'bg-green-500/10 text-green-500 border-green-500/20',
                    PROCESSING: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                    PENDING: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                    FAILED: 'bg-red-500/10 text-red-500 border-red-500/20',
                };
                return (
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${map[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                        {status === 'PROCESSING' || status === 'PENDING' ? (
                            <Loader2 size={10} className="mr-1 animate-spin" />
                        ) : null}
                        {status}
                    </span>
                );
            },
        },
        {
            accessorKey: 'totalFound',
            header: 'Total Found',
            cell: ({ row }) => (
                <span className="text-sm font-mono text-secondary">{row.getValue('totalFound')}</span>
            ),
        },
        {
            accessorKey: 'converted',
            header: 'In Audiences',
            cell: ({ row }) => (
                <span className="text-sm font-mono text-secondary">{row.getValue('converted')}</span>
            ),
        },
        {
            accessorKey: 'createdAt',
            header: 'Created',
            cell: ({ row }) => (
                <span className="text-sm text-muted">
                    {formatDistanceToNow(new Date(row.getValue('createdAt')), { addSuffix: true })}
                </span>
            ),
        },
        {
            id: 'actions',
            cell: ({ row }) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-theme">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/leads/${row.original.id}`)}>
                            View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="text-red-500"
                            onClick={async () => {
                                if (confirm('Delete this lead list?')) {
                                    await deleteLeadList(row.original.id);
                                }
                            }}
                        >
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* ── Smart Search Bar ─────────────────────────────────────────────── */}
            <form onSubmit={handleSearch} className="relative">
                <div className={`flex items-center gap-3 rounded-xl border bg-elevated px-4 py-3 transition-all duration-200 ${isSearching ? 'border-accent/50 shadow-lg shadow-accent/10' : 'border-theme hover:border-accent/30'}`}>
                    {isSearching
                        ? <Brain size={18} className="text-accent shrink-0 animate-pulse" />
                        : <Search size={18} className="text-muted shrink-0" />
                    }
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder='Try "grocery shops in Madurai" or "marketing agencies in Mumbai"…'
                        disabled={isSearching}
                        className="flex-1 bg-transparent text-sm text-primary placeholder:text-muted outline-none disabled:opacity-60"
                        aria-label="Smart lead search"
                    />
                    {query.trim() && !isSearching && (
                        <div className="flex items-center gap-1 shrink-0">
                            <Sparkles size={12} className="text-accent/60" />
                            <span className="text-[11px] text-accent/60 font-medium hidden sm:block">AI-powered</span>
                        </div>
                    )}
                    <Button
                        type="submit"
                        variant="accent"
                        size="sm"
                        disabled={!query.trim() || isSearching}
                        className="shrink-0"
                    >
                        {isSearching
                            ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Searching…</>
                            : 'Generate Leads'
                        }
                    </Button>
                </div>

                {/* Hint text */}
                {!isSearching && (
                    <p className="mt-2 text-[12px] text-muted px-1">
                        Just describe what you&apos;re looking for — AI automatically searches across synonyms &amp; city areas for maximum coverage.
                    </p>
                )}
            </form>

            {/* ── Toast notification ───────────────────────────────────────────── */}
            {toast && (
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm animate-in slide-in-from-top-2 duration-300 ${
                    toast.type === 'success' ? 'bg-green-500/8 border-green-500/25 text-green-300' :
                    toast.type === 'error'   ? 'bg-red-500/8 border-red-500/25 text-red-300' :
                    'bg-accent/8 border-accent/25 text-accent'
                }`}>
                    {toast.type === 'loading' && <Loader2 size={16} className="shrink-0 mt-0.5 animate-spin" />}
                    {toast.type === 'success' && <CheckCircle2 size={16} className="shrink-0 mt-0.5" />}
                    {toast.type === 'error'   && <span className="shrink-0 mt-0.5 text-base leading-none">⚠</span>}
                    <div>
                        <p className="font-semibold">{toast.message}</p>
                        {toast.detail && <p className="text-[12px] opacity-70 mt-0.5">{toast.detail}</p>}
                    </div>
                </div>
            )}

            {/* ── Results table ─────────────────────────────────────────────────── */}
            <div className="animate-in fade-in duration-500">
                <DataTable columns={columns} data={lists} searchKey="query" />
            </div>
        </div>
    );
}
