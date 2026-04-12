'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useContacts } from '@/hooks/useContacts';
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalTitle,
    ModalFooter,
    ModalClose,
} from '@/components/ui/Modal';
import {
    FormField,
    Form,
    FormItem,
    FormLabel,
    FormControl,
    FormMessage,
    Input,
} from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';

// ─── Schema (mirrors @whatszor/shared CreateContactSchema) ───────────────────
const contactSchema = z.object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName:  z.string().trim().optional(),
    // Server enforces E.164: +[country code][number]
    phone:     z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/, 'Must be E.164 format, e.g. +919876543210')
        .optional()
        .or(z.literal('')),
    email:     z.string().email('Invalid email address').optional().or(z.literal('')),
});

type ContactFormValues = z.infer<typeof contactSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────
interface AddContactModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AddContactModal({ open, onOpenChange }: AddContactModalProps) {
    const { createContact } = useContacts();

    const form = useForm<ContactFormValues>({
        resolver: zodResolver(contactSchema),
        defaultValues: { firstName: '', lastName: '', phone: '', email: '' },
    });

    // Reset form whenever modal is opened
    React.useEffect(() => {
        if (open) form.reset();
    }, [open, form]);

    const onSubmit = async (values: ContactFormValues) => {
        try {
            await createContact({
                ...values,
                // Strip empty strings so nullable optional fields stay clean
                lastName:  values.lastName  || undefined,
                email:     values.email     || undefined,
                phone:     values.phone     || undefined,
                customData: {},          // required by server schema
            } as any);
            onOpenChange(false);
        } catch {
            // Errors surfaced by the mutation's toast
        }
    };

    return (
        <Modal open={open} onOpenChange={onOpenChange}>
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
                                        <Input placeholder="+919876543210" {...field} />
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
                            <Button
                                type="submit"
                                variant="accent"
                                disabled={form.formState.isSubmitting}
                            >
                                {form.formState.isSubmitting ? 'Saving…' : 'Save Contact'}
                            </Button>
                        </ModalFooter>
                    </form>
                </Form>
            </ModalContent>
        </Modal>
    );
}
