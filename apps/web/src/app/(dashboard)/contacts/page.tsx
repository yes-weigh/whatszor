'use client';

import * as React from 'react';
import { Header } from '@/components/layout/Header';
import { useContacts, type Contact } from '@/hooks/useContacts';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { 
    Plus, 
    Trash2, 
    Mail, 
    Phone, 
    MoreHorizontal
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

const contactSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().optional(),
    phone: z.string().min(5, 'Valid phone number is required'),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function ContactsPage() {
    const router = useRouter();
    const hasPermission = useAuthStore(s => s.hasPermission);
    const { 
        contacts, 
        createContact, 
        bulkDelete 
    } = useContacts();

    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [selectedRows, setSelectedRows] = React.useState<string[]>([]);

    const form = useForm<ContactFormValues>({
        resolver: zodResolver(contactSchema),
        defaultValues: {
            firstName: '',
            lastName: '',
            phone: '',
            email: '',
        },
    });

    const onSubmit = async (values: ContactFormValues) => {
        try {
            await createContact(values);
            setIsAddModalOpen(false);
            form.reset();
        } catch (error) {
            // Error handled by mutation toast
        }
    };

    const handleDeleteSelected = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedRows.length} contacts?`)) return;
        await bulkDelete(selectedRows);
        setSelectedRows([]);
    };

    const columns: ColumnDef<Contact>[] = [
        {
            id: "select",
            header: ({ table }) => (
                <input
                    type="checkbox"
                    checked={table.getIsAllPageRowsSelected()}
                    onChange={(e) => table.toggleAllPageRowsSelected(!!e.target.checked)}
                    aria-label="Select all"
                    className="rounded border-theme bg-elevated text-accent focus:ring-accent"
                />
            ),
            cell: ({ row }) => (
                <input
                    type="checkbox"
                    checked={row.getIsSelected()}
                    onChange={(e) => row.toggleSelected(!!e.target.checked)}
                    aria-label="Select row"
                    className="rounded border-theme bg-elevated text-accent focus:ring-accent"
                    onClick={(e) => e.stopPropagation()}
                />
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: "firstName",
            header: "Name",
            cell: ({ row }) => {
                const contact = row.original;
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-accent/10 text-accent border border-accent/20">
                            {contact.firstName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-primary">
                            {contact.firstName} {contact.lastName}
                        </span>
                    </div>
                );
            },
        },
        {
            accessorKey: "phone",
            header: "Phone",
            cell: ({ row }) => (
                <div className="flex items-center gap-2 text-sm text-secondary">
                    <Phone size={14} className="text-muted" />
                    {row.getValue("phone") || "—"}
                </div>
            ),
        },
        {
            accessorKey: "email",
            header: "Email",
            cell: ({ row }) => (
                <div className="flex items-center gap-2 text-sm text-secondary">
                    <Mail size={14} className="text-muted" />
                    {row.getValue("email") || "—"}
                </div>
            ),
        },
        {
            accessorKey: "pipeline",
            header: "Pipeline",
            cell: ({ row }) => {
                const pipelineName = (row.getValue("pipeline") as any)?.name;
                return (
                    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-500 ring-1 ring-inset ring-blue-500/20">
                        {pipelineName || "No Pipeline"}
                    </span>
                );
            },
        },
        {
            id: "source",
            header: "Source",
            cell: ({ row }) => {
                const customData = row.original.customData as any;
                const sessionName = customData?.sourceSessionName;
                const phoneNumber = customData?.sourcePhoneNumber;
                
                if (!sessionName && !phoneNumber) return <span className="text-sm text-muted">—</span>;
                
                return (
                    <div className="flex flex-col gap-0.5 text-sm text-secondary">
                        <span className="font-medium text-primary">{sessionName || "Unknown Session"}</span>
                        {phoneNumber && <span className="text-xs text-muted font-mono">{phoneNumber}</span>}
                    </div>
                );
            },
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
                        <DropdownMenuItem onClick={() => router.push(`/contacts/${row.original.id}`)}>
                            View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-500" onClick={() => bulkDelete([row.original.id])}>
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
                title="Contacts" 
                subtitle="Manage your customer relationships" 
            />
            
            <div className="p-6 md:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        {selectedRows.length > 0 && hasPermission('contacts:delete') && (
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                onClick={handleDeleteSelected}
                                className="animate-in fade-in slide-in-from-left-2"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete ({selectedRows.length})
                            </Button>
                        )}
                        
                        {hasPermission('contacts:create') && (
                            <Modal open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                                <ModalTrigger asChild>
                                    <Button variant="accent" size="sm">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Contact
                                    </Button>
                                </ModalTrigger>
                                <ModalContent className="sm:max-w-[425px]">
                                    <ModalHeader>
                                        <ModalTitle>Add New Contact</ModalTitle>
                                    </ModalHeader>
                                    <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormField
                                                control={form.control}
                                                name="firstName"
                                                render={({ field }) => (
                                                    <FormItem name="firstName">
                                                        <FormLabel>First Name</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="John" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="lastName"
                                                render={({ field }) => (
                                                    <FormItem name="lastName">
                                                        <FormLabel>Last Name</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="Doe" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        <FormField
                                            control={form.control}
                                            name="phone"
                                            render={({ field }) => (
                                                <FormItem name="phone">
                                                    <FormLabel>Phone Number</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="+123456789" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="email"
                                            render={({ field }) => (
                                                <FormItem name="email">
                                                    <FormLabel>Email Address</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="john@doe.com" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <ModalFooter className="pt-4">
                                            <ModalClose asChild>
                                                <Button type="button" variant="outline">Cancel</Button>
                                            </ModalClose>
                                            <Button type="submit" variant="accent" disabled={form.formState.isSubmitting}>
                                                {form.formState.isSubmitting ? 'Saving...' : 'Save Contact'}
                                            </Button>
                                        </ModalFooter>
                                    </form>
                                    </Form>
                                </ModalContent>
                            </Modal>
                        )}
                    </div>
                </div>

                <div className="animate-in fade-in duration-500">
                    <DataTable 
                        columns={columns} 
                        data={contacts} 
                        searchKey="firstName"
                    />
                </div>
            </div>
        </div>
    );
}
