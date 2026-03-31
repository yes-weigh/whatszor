import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface QuickReplyMedia {
    id: string;
    name: string;
    url: string;
    type: string;
    mimeType?: string | null;
}

export interface QuickReply {
    id: string;
    shortcut: string;
    content: string;
    mediaId?: string | null;
    media?: QuickReplyMedia | null;
    createdAt: string;
}

export function useQuickReplies() {
    const queryClient = useQueryClient();

    const queryInfo = useQuery({
        queryKey: ['quick-replies'],
        queryFn: () => apiClient.get<QuickReply[]>('/quick-replies'),
    });

    const createMutation = useMutation({
        mutationFn: (data: { shortcut: string; content: string; mediaId?: string | null }) =>
            apiClient.post<QuickReply>('/quick-replies', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, ...data }: { id: string; shortcut?: string; content?: string; mediaId?: string | null }) =>
            apiClient.patch<QuickReply>(`/quick-replies/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/quick-replies/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
        },
    });

    return {
        ...queryInfo,
        quickReplies: queryInfo.data || [],
        createQuickReply: createMutation.mutateAsync,
        updateQuickReply: updateMutation.mutateAsync,
        deleteQuickReply: deleteMutation.mutateAsync,
        isCreating: createMutation.isPending,
    };
}
