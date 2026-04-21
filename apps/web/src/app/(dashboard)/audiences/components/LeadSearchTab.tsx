'use client';

import * as React from 'react';
import { useLeadGenerationLists, useLeadGenerationSuggestions } from '@/hooks/useLeadGeneration';
import type { LeadList, LeadSuggestion } from '@/lib/leadGeneration.api';
import { useRouter } from 'next/navigation';
import { 
    Plus, 
    MapPin, 
    MoreHorizontal,
    Search,
    Loader2,
    Zap,
    Sparkles,
    Check,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { 
    Modal, 
    ModalContent, 
    ModalHeader, 
    ModalTitle, 
    ModalTrigger,
    ModalFooter,
    ModalClose
} from '@/components/ui/Modal';
import { 
    FormField, 
    Form,
    FormItem, 
    FormLabel, 
    FormControl, 
    FormMessage,
    Input 
} from '@/components/ui/FormField';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from '@/components/ui/Dropdown';
import { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';

const searchSchema = z.object({
    keyword: z.string().min(1, 'Keyword is required'),
    location: z.string().min(1, 'Location is required'),
});

type SearchFormValues = z.infer<typeof searchSchema>;

export function LeadSearchTab() {
    const router = useRouter();
    const { 
        lists, 
        generateLeads, 
        batchGenerateLeads,
        isBatchGenerating,
        deleteLeadList,
        isGenerating
    } = useLeadGenerationLists();

    const suggestionsMutation = useLeadGenerationSuggestions();

    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [suggestions, setSuggestions] = React.useState<LeadSuggestion[]>([]);
    const [selectedChips, setSelectedChips] = React.useState<Set<number>>(new Set());

    const form = useForm<SearchFormValues>({
        resolver: zodResolver(searchSchema) as any,
        defaultValues: {
            keyword: '',
            location: '',
        },
    });

    // Reset modal state when closed
    React.useEffect(() => {
        if (!isAddModalOpen) {
            form.reset();
            setSuggestions([]);
            setSelectedChips(new Set());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddModalOpen]);

    const onSubmit = async (values: SearchFormValues) => {
        const query = `${values.keyword} in ${values.location}`;
        try {
            const result = await generateLeads({ query, fetchMaximum: true });
            setIsAddModalOpen(false);
            if (result.leadListId) {
                router.push(`/leads/${result.leadListId}`);
            }
        } catch (error) {
            // Handled in hook
        }
    };

    const handleSuggest = async () => {
        const values = form.getValues();
        if (!values.keyword || !values.location) return;
        setSuggestions([]);
        setSelectedChips(new Set());
        try {
            const result = await suggestionsMutation.mutateAsync({
                keyword: values.keyword,
                location: values.location,
            });
            setSuggestions(result.suggestions || []);
        } catch (_) {
            // handled in hook
        }
    };

    const toggleChip = (idx: number) => {
        setSelectedChips(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };



    const handleBatchLaunch = async () => {
        if (isBatchGenerating || selectedChips.size === 0) return;
        const indices = Array.from(selectedChips).sort((a, b) => a - b);
        const rootQuery = `${form.getValues('keyword')} in ${form.getValues('location')}`;
        
        const segments = indices.map(idx => ({
            keyword: suggestions[idx].keyword,
            location: suggestions[idx].location
        }));

        try {
            const result = await batchGenerateLeads({ rootQuery, segments });
            setIsAddModalOpen(false);
            if (result.audienceId) {
                // Not pushing to audience yet, user sees them in leads tab
            }
        } catch (_) { /* errors handled by hook */ }
    };

    const columns: ColumnDef<LeadList>[] = [
        {
            accessorKey: "query",
            header: "Search Query",
            cell: ({ row }) => {
                const list = row.original;
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-accent/10 text-accent border border-accent/20">
                            <MapPin size={18} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-primary">
                                {list.query}
                            </span>
                            <span className="text-xs text-muted">
                                {list.name || "Unnamed List"}
                            </span>
                        </div>
                    </div>
                );
            },
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => {
                const status = row.getValue("status") as string;
                let bgClass = "bg-gray-500/10 text-gray-400 border-gray-500/20";
                
                if (status === 'READY') bgClass = "bg-green-500/10 text-green-500 border-green-500/20";
                else if (status === 'PROCESSING' || status === 'PENDING') bgClass = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                else if (status === 'FAILED') bgClass = "bg-red-500/10 text-red-500 border-red-500/20";

                return (
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${bgClass}`}>
                        {status}
                    </span>
                );
            },
        },
        {
            accessorKey: "totalFound",
            header: "Total Found",
            cell: ({ row }) => (
                <div className="text-sm text-secondary font-mono">
                    {row.getValue("totalFound")}
                </div>
            ),
        },
        {
            accessorKey: "converted",
            header: "In Audiences",
            cell: ({ row }) => (
                <div className="text-sm text-secondary font-mono">
                    {row.getValue("converted")}
                </div>
            ),
        },
        {
            accessorKey: "createdAt",
            header: "Created",
            cell: ({ row }) => (
                <div className="text-sm text-secondary">
                    {formatDistanceToNow(new Date(row.getValue("createdAt")), { addSuffix: true })}
                </div>
            ),
        },
        {
            id: "actions",
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
                        <DropdownMenuItem className="text-red-500" onClick={async () => {
                            if (confirm('Delete this lead list?')) {
                                await deleteLeadList(row.original.id);
                            }
                        }}>
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Modal open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                        <ModalTrigger asChild>
                            <Button variant="accent" size="sm">
                                <Plus className="mr-2 h-4 w-4" />
                                Generate Leads
                            </Button>
                        </ModalTrigger>
                        <ModalContent className="sm:max-w-[520px]">
                            <ModalHeader>
                                <ModalTitle>Search Businesses</ModalTitle>
                            </ModalHeader>
                            
                            <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
                                <div className="grid gap-4">
                                    <FormField
                                        control={form.control}
                                        name="keyword"
                                        render={({ field }) => (
                                            <FormItem name="keyword">
                                                <FormLabel>Keyword (e.g. Bakery, Marketing Agency)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Bakery" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="location"
                                        render={({ field }) => (
                                            <FormItem name="location">
                                                <FormLabel>Location (e.g. Vyttila, New York)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Vyttila" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>


                                {/* AI Suggestions section */}
                                <div className="rounded-lg border border-[rgba(34,197,94,0.15)] bg-[rgba(34,197,94,0.02)] p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-[12px] font-semibold text-accent flex items-center gap-1.5">
                                                <Sparkles size={12} /> AI Segment Suggestions
                                            </p>
                                            <p className="text-[11px] text-muted mt-0.5">
                                                Select multiple segments — each queues up to 60 leads in parallel.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSuggest}
                                            disabled={suggestionsMutation.isPending || !form.watch('keyword') || !form.watch('location') || isBatchGenerating}
                                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent/10 border border-accent/30 text-accent text-[12px] font-semibold hover:bg-accent/20 transition-colors disabled:opacity-50"
                                        >
                                            {suggestionsMutation.isPending
                                                ? <><Loader2 size={12} className="animate-spin" /> Thinking…</>
                                                : <><Sparkles size={12} /> Suggest</>}
                                        </button>
                                    </div>

                                    {/* Multi-select chips */}
                                    {suggestions.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[11px] text-muted uppercase tracking-wider font-semibold">Select segments to batch-generate</p>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (selectedChips.size === suggestions.length) {
                                                            setSelectedChips(new Set());
                                                        } else {
                                                            setSelectedChips(new Set(suggestions.map((_, i) => i)));
                                                        }
                                                    }}
                                                    className="text-[11px] text-accent/70 hover:text-accent transition-colors"
                                                >
                                                    {selectedChips.size === suggestions.length ? 'Deselect all' : 'Select all'}
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {suggestions.map((chip, idx) => {
                                                    const isSelected = selectedChips.has(idx);
                                                    return (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => !isBatchGenerating && toggleChip(idx)}
                                                            disabled={isBatchGenerating}
                                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all text-[12px] ${
                                                                isSelected
                                                                    ? 'border-accent/60 bg-[rgba(34,197,94,0.12)] text-white'
                                                                    : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-white/60 hover:border-accent/30 hover:text-white/80'
                                                            } disabled:cursor-default`}
                                                        >
                                                            {isSelected
                                                                ? <Check size={11} className="text-accent shrink-0" />
                                                                : <div className="w-[11px] h-[11px] rounded-full border border-white/20 shrink-0" />
                                                            }
                                                            <span className={`font-medium ${isSelected ? 'text-accent' : 'text-accent/60'}`}>{chip.keyword}</span>
                                                            <span className="text-white/30">in</span>
                                                            <span>{chip.location}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>


                                        </div>
                                    )}

                                    {suggestionsMutation.isPending && suggestions.length === 0 && (
                                        <div className="flex items-center gap-2 text-[12px] text-muted py-1">
                                            <Loader2 size={12} className="animate-spin text-accent" />
                                            Generating AI segment ideas…
                                        </div>
                                    )}
                                </div>

                                <ModalFooter className="pt-2">
                                    <ModalClose asChild>
                                        <Button type="button" variant="outline" disabled={isBatchGenerating}>Cancel</Button>
                                    </ModalClose>
                                    {selectedChips.size > 0 ? (
                                        <Button
                                            type="button"
                                            variant="accent"
                                            onClick={handleBatchLaunch}
                                            disabled={isBatchGenerating}
                                        >
                                            {isBatchGenerating
                                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gathering {selectedChips.size} segments…</>
                                                : <><Zap className="mr-2 h-4 w-4" /> Pool {selectedChips.size} Segments to Audience</>
                                            }
                                        </Button>
                                    ) : (
                                        <Button type="submit" variant="accent" disabled={isGenerating}>
                                            {isGenerating
                                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Launching…</>
                                                : <><Search className="mr-2 h-4 w-4" /> Search &amp; Generate</>
                                            }
                                        </Button>
                                    )}
                                </ModalFooter>
                            </form>
                            </Form>
                        </ModalContent>
                    </Modal>
                </div>
            </div>

            <div className="animate-in fade-in duration-500">
                <DataTable 
                    columns={columns} 
                    data={lists} 
                    searchKey="query"
                />
            </div>
        </div>
    );
}
