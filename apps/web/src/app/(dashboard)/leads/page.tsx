'use client';

import * as React from 'react';
import { Header } from '@/components/layout/Header';
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
    ChevronRight,
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
    fetchMaximum: z.boolean().default(false),
});

type SearchFormValues = z.infer<typeof searchSchema>;

export default function LeadGenerationPage() {
    const router = useRouter();
    const { 
        lists, 
        generateLeads, 
        deleteLeadList,
        isGenerating
    } = useLeadGenerationLists();

    const suggestionsMutation = useLeadGenerationSuggestions();

    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [suggestions, setSuggestions] = React.useState<LeadSuggestion[]>([]);
    const [launchingIdx, setLaunchingIdx] = React.useState<number | null>(null);

    const form = useForm<SearchFormValues>({
        resolver: zodResolver(searchSchema) as any,
        defaultValues: {
            keyword: '',
            location: '',
            fetchMaximum: false,
        },
    });

    // Reset modal state when closed
    React.useEffect(() => {
        if (!isAddModalOpen) {
            form.reset();
            setSuggestions([]);
            setLaunchingIdx(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddModalOpen]);

    const onSubmit = async (values: SearchFormValues) => {
        const query = `${values.keyword} in ${values.location}`;
        try {
            const result = await generateLeads({ query, fetchMaximum: values.fetchMaximum });
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

    const handleChipLaunch = async (chip: LeadSuggestion, idx: number) => {
        if (launchingIdx !== null || isGenerating) return;
        setLaunchingIdx(idx);
        const query = `${chip.keyword} in ${chip.location}`;
        try {
            const result = await generateLeads({ query, fetchMaximum: false });
            setIsAddModalOpen(false);
            if (result.leadListId) {
                router.push(`/leads/${result.leadListId}`);
            }
        } catch (_) {
            // handled in hook
        } finally {
            setLaunchingIdx(null);
        }
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
            header: "Converted",
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
        <div className="flex flex-col min-h-screen">
            <Header 
                title="Lead Generation" 
                subtitle="Discover businesses and generate leads from Google Maps" 
            />
            
            <div className="p-6 md:p-8 space-y-6">
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

                                    {/* Fetch Maximum Toggle */}
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => form.setValue('fetchMaximum', !form.watch('fetchMaximum'))}
                                        onKeyDown={(e) => e.key === 'Enter' && form.setValue('fetchMaximum', !form.watch('fetchMaximum'))}
                                        className={`flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer select-none transition-colors ${
                                            form.watch('fetchMaximum')
                                                ? 'bg-accent/10 border-accent/40'
                                                : 'bg-elevated border-theme hover:border-accent/30'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Zap size={15} className={form.watch('fetchMaximum') ? 'text-accent' : 'text-muted'} />
                                            <div>
                                                <p className="text-sm font-semibold text-primary">Fetch maximum contacts</p>
                                                <p className="text-xs text-muted">Fetch up to 60 results per search (uses more API quota)</p>
                                            </div>
                                        </div>
                                        <div className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                                            form.watch('fetchMaximum') ? 'bg-accent' : 'bg-muted/30'
                                        }`}>
                                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                form.watch('fetchMaximum') ? 'translate-x-5' : 'translate-x-0'
                                            }`} />
                                        </div>
                                    </div>

                                    {/* AI Suggestions section */}
                                    <div className="rounded-lg border border-[rgba(34,197,94,0.15)] bg-[rgba(34,197,94,0.02)] p-3 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[12px] font-semibold text-accent flex items-center gap-1.5">
                                                    <Sparkles size={12} /> AI Segment Suggestions
                                                </p>
                                                <p className="text-[11px] text-muted mt-0.5">
                                                    Get 10 smart keyword+area combos — each brings up to 60 leads (up to 600 total).
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleSuggest}
                                                disabled={suggestionsMutation.isPending || !form.watch('keyword') || !form.watch('location')}
                                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent/10 border border-accent/30 text-accent text-[12px] font-semibold hover:bg-accent/20 transition-colors disabled:opacity-50"
                                            >
                                                {suggestionsMutation.isPending
                                                    ? <><Loader2 size={12} className="animate-spin" /> Thinking…</>
                                                    : <><Sparkles size={12} /> Suggest</>}
                                            </button>
                                        </div>

                                        {/* Chips */}
                                        {suggestions.length > 0 && (
                                            <div className="space-y-1.5">
                                                <p className="text-[11px] text-muted uppercase tracking-wider font-semibold">Click a segment to launch instantly</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {suggestions.map((chip, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => handleChipLaunch(chip, idx)}
                                                            disabled={launchingIdx !== null || isGenerating}
                                                            className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-accent/40 hover:bg-[rgba(34,197,94,0.06)] transition-all text-[12px] text-white/70 hover:text-white disabled:opacity-50"
                                                        >
                                                            {launchingIdx === idx
                                                                ? <Loader2 size={11} className="animate-spin text-accent" />
                                                                : <ChevronRight size={11} className="text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            }
                                                            <span className="font-medium text-accent/80 group-hover:text-accent">{chip.keyword}</span>
                                                            <span className="text-white/30">in</span>
                                                            <span>{chip.location}</span>
                                                        </button>
                                                    ))}
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
                                            <Button type="button" variant="outline">Cancel</Button>
                                        </ModalClose>
                                        <Button type="submit" variant="accent" disabled={isGenerating}>
                                            {isGenerating
                                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Launching…</>
                                                : <><Search className="mr-2 h-4 w-4" /> Search & Generate</>
                                            }
                                        </Button>
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
        </div>
    );
}
