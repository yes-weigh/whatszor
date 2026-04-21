'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadGenerationApi, LeadList, ConvertResult } from '@/lib/leadGeneration.api';
import { toast } from 'react-hot-toast';
import { useRealtimeEvents } from './use-realtime-events';

export function useLeadGenerationLists() {
    const queryClient = useQueryClient();

    const { data: listsResult, isLoading, refetch } = useQuery<{ items: LeadList[], total: number }>({
        queryKey: ['leadLists'],
        queryFn: () => leadGenerationApi.getLeadLists(),
    });

    useRealtimeEvents({
        onLeadListReady: (payload) => {
            if (payload.leadListId) {
                queryClient.invalidateQueries({ queryKey: ['leadLists'] });
                queryClient.invalidateQueries({ queryKey: ['leadList', payload.leadListId] });
                toast.success(`Leads generated! Found ${payload.totalFound} results for "${payload.name}".`);
            }
        },
        onLeadListFailed: (payload) => {
            if (payload.leadListId) {
                queryClient.invalidateQueries({ queryKey: ['leadLists'] });
                queryClient.invalidateQueries({ queryKey: ['leadList', payload.leadListId] });
                toast.error(`Lead generation failed: ${payload.errorReason}`);
            }
        }
    });

    const generateMutation = useMutation({
        mutationFn: ({ query, fetchMaximum }: { query: string; fetchMaximum?: boolean }) =>
            leadGenerationApi.generateLeads(query, fetchMaximum),
        onSuccess: (data) => {
            toast.success(data.message || 'Generation started! Please wait.');
            queryClient.invalidateQueries({ queryKey: ['leadLists'] });
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to start generation');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => leadGenerationApi.deleteLeadList(id),
        onSuccess: () => {
            toast.success('Lead list deleted.');
            queryClient.invalidateQueries({ queryKey: ['leadLists'] });
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to delete lead list');
        }
    });

    return {
        lists: listsResult?.items || [],
        total: listsResult?.total || 0,
        isLoading,
        refetch,
        generateLeads: generateMutation.mutateAsync,
        isGenerating: generateMutation.isPending,
        deleteLeadList: deleteMutation.mutateAsync,
        isDeleting: deleteMutation.isPending,
    };
}

export function useLeadGenerationDetail(id: string, filter?: 'all' | 'with_phone' | 'converted' | 'raw') {
    const queryClient = useQueryClient();

    const { data: listData, isLoading, refetch } = useQuery({
        queryKey: ['leadList', id, filter],
        queryFn: () => leadGenerationApi.getLeadList(id, { filter }),
        enabled: !!id,
    });

    useRealtimeEvents({
        onLeadListReady: (payload) => {
            if (payload.leadListId === id) {
                queryClient.invalidateQueries({ queryKey: ['leadList', id] });
                toast.success(`Leads generated! Found ${payload.totalFound} results.`);
            }
        },
        onLeadListFailed: (payload) => {
            if (payload.leadListId === id) {
                queryClient.invalidateQueries({ queryKey: ['leadList', id] });
                toast.error(`Lead generation failed: ${payload.errorReason}`);
            }
        }
    });

    const convertMutation = useMutation({
        mutationFn: (params: { leadIds?: string[], skipExisting?: boolean, createAudience?: boolean, audienceId?: string }) => leadGenerationApi.convertLeads(id, params),
        onSuccess: (data: ConvertResult) => {
            toast.success(`Converted ${data.converted} contacts. Skipped ${data.skipped}.`);
            queryClient.invalidateQueries({ queryKey: ['leadList', id] });
            queryClient.invalidateQueries({ queryKey: ['leadLists'] });
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to convert leads');
        }
    });

    return {
        list: listData,
        leads: listData?.leads || [],
        leadsTotal: listData?.leadsTotal || 0,
        isLoading,
        refetch,
        convertLeads: convertMutation.mutateAsync,
        isConverting: convertMutation.isPending,
    };
}

export function useLeadGenerationPreview() {
    return useMutation({
        mutationFn: (query: string) => leadGenerationApi.previewLeads(query),
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to preview leads');
        }
    });
}

export function useLeadGenerationSuggestions() {
    return useMutation({
        mutationFn: ({ keyword, location }: { keyword: string; location: string }) =>
            leadGenerationApi.suggestLeadQueries(keyword, location),
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to get AI suggestions');
        }
    });
}
