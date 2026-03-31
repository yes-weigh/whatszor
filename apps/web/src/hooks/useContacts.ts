'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import api from '@/lib/api';
import { useState } from 'react';
import { toast } from 'react-hot-toast';

export interface Contact {
    id: string;
    firstName: string;
    lastName?: string;
    phone: string;
    email?: string;
    pipeline?: { name: string };
    tags?: string[];
}

export function useContacts() {
    const [search, setSearch] = useState('');
    const queryClient = useQueryClient();

    // Fetch contacts
    // The interceptor unwraps { success, data } -> payload directly.
    // /crm/contacts returns an array, so r.data is Contact[] after unwrap.
    const { data: contacts = [], isLoading, refetch } = useQuery<Contact[]>({
        queryKey: ['contacts', search],
        queryFn: () => apiClient.get<Contact[]>(`/crm/contacts?search=${search}`),
    });

    // Create contact
    const createMutation = useMutation({
        mutationFn: (newContact: Partial<Contact>) => api.post('/crm/contacts', newContact),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            toast.success('Contact created successfully');
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to create contact');
        },
    });

    // Bulk delete contacts
    const bulkDeleteMutation = useMutation({
        mutationFn: (ids: string[]) => api.delete('/crm/contacts/bulk', { data: { ids } }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            toast.success('Contacts deleted successfully');
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to delete contacts');
        },
    });

    return {
        contacts,
        isLoading,
        search,
        setSearch,
        refetch,
        createContact: createMutation.mutateAsync,
        isCreating: createMutation.isPending,
        bulkDelete: bulkDeleteMutation.mutateAsync,
        isDeleting: bulkDeleteMutation.isPending,
    };
}
