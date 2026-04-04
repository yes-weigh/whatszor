'use client';

import * as React from 'react';
import { Header } from '@/components/layout/Header';
import { useLeadGenerationLists, useLeadGenerationPreview } from '@/hooks/useLeadGeneration';
import type { LeadList, SearchPreviewResult } from '@/lib/leadGeneration.api';
import { useRouter } from 'next/navigation';
import { 
    Plus, 
    MapPin, 
    MoreHorizontal,
    Search,
    Loader2
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

export default function LeadGenerationPage() {
    const router = useRouter();
    const { 
        lists, 
        generateLeads, 
        deleteLeadList,
        isGenerating
    } = useLeadGenerationLists();

    const previewMutation = useLeadGenerationPreview();

    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [previewData, setPreviewData] = React.useState<SearchPreviewResult | null>(null);

    const form = useForm<SearchFormValues>({
        resolver: zodResolver(searchSchema),
        defaultValues: {
            keyword: '',
            location: '',
        },
    });

    // Store mutation.reset in a ref so it doesn't change the effect's deps
    const mutationResetRef = React.useRef(previewMutation.reset);
    mutationResetRef.current = previewMutation.reset;

    // Reset modal state when closed
    React.useEffect(() => {
        if (!isAddModalOpen) {
            form.reset();
            setPreviewData(null);
            mutationResetRef.current();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddModalOpen]);

    const onPreviewSubmit = async (values: SearchFormValues) => {
        try {
            const query = `${values.keyword} in ${values.location}`;
            const data = await previewMutation.mutateAsync(query);
            setPreviewData(data);
        } catch (error) {
            // Toast is handled in the hook
        }
    };

    const handleGenerate = async () => {
        const values = form.getValues();
        const query = `${values.keyword} in ${values.location}`;
        try {
            const result = await generateLeads(query);
            setIsAddModalOpen(false);
            if (result.leadListId) {
                router.push(`/leads/${result.leadListId}`);
            }
        } catch (error) {
            // Handled in hook
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
                            <ModalContent className="sm:max-w-[450px]">
                                <ModalHeader>
                                    <ModalTitle>Search Businesses</ModalTitle>
                                </ModalHeader>
                                
                                {!previewData ? (
                                    <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onPreviewSubmit)} className="space-y-4 py-4">
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
                                        <ModalFooter className="pt-4">
                                            <ModalClose asChild>
                                                <Button type="button" variant="outline">Cancel</Button>
                                            </ModalClose>
                                            <Button type="submit" variant="accent" disabled={previewMutation.isPending}>
                                                {previewMutation.isPending ? 'Searching...' : 'Search'}
                                                {!previewMutation.isPending && <Search className="ml-2 h-4 w-4"/>}
                                            </Button>
                                        </ModalFooter>
                                    </form>
                                    </Form>
                                ) : (
                                    <div className="space-y-4 py-4">
                                        <div className="p-4 bg-accent/5 rounded-lg border border-accent/20 flex flex-col items-center justify-center text-center">
                                            <p className="text-sm text-secondary">Estimated leads available</p>
                                            <p className="text-3xl font-bold text-accent">{previewData.estimatedCount}+</p>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <p className="text-sm font-semibold text-primary">Sample Results</p>
                                            {previewData.sample.length === 0 ? (
                                                <p className="text-sm text-muted">No samples found.</p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {previewData.sample.map((s, i) => (
                                                        <li key={i} className="text-sm bg-elevated border border-theme p-3 rounded-lg flex flex-col">
                                                            <span className="font-semibold text-primary">{s.displayName}</span>
                                                            <span className="text-xs text-muted truncate">{s.address || 'No address'}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        <ModalFooter className="pt-4">
                                            <Button type="button" variant="outline" onClick={() => setPreviewData(null)}>Back to Search</Button>
                                            <Button type="button" variant="accent" onClick={handleGenerate} disabled={isGenerating}>
                                                {isGenerating ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Processing...
                                                    </>
                                                ) : 'Generate List'}
                                            </Button>
                                        </ModalFooter>
                                    </div>
                                )}
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
