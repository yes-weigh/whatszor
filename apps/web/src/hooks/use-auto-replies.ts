import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface AutoReplyMedia {
    id: string;
    name: string;
    url: string;
    type: string;
    mimeType?: string | null;
}

export interface AutoReplyTemplate {
    id: string;
    name: string;
    versions: Array<{
        id: string;
        messageText: string;
        footerText?: string | null;
        buttons: Array<{ id: string; label: string; payload?: string | null }>;
        media?: AutoReplyMedia | null;
    }>;
}

export interface AutoReply {
    id: string;
    keyword: string;
    content: string;
    mediaId?: string | null;
    templateId?: string | null;
    media?: AutoReplyMedia | null;
    template?: AutoReplyTemplate | null;
    isAutoReply: boolean;
    createdAt: string;
}

export type CreateAutoReplyInput =
    | { keyword: string; content: string; mediaId?: string | null; templateId?: null }
    | { keyword: string; templateId: string; content?: string; mediaId?: null };

export type UpdateAutoReplyInput = { id: string } & Partial<{
    keyword: string;
    content: string;
    mediaId: string | null;
    templateId: string | null;
}>;

export function useAutoReplies() {
    const queryClient = useQueryClient();

    const queryInfo = useQuery({
        queryKey: ['auto-replies'],
        queryFn: () => apiClient.get<AutoReply[]>('/quick-replies/auto'),
    });

    const createMutation = useMutation({
        mutationFn: (data: CreateAutoReplyInput) =>
            apiClient.post<AutoReply>('/quick-replies/auto', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auto-replies'] }),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, ...data }: UpdateAutoReplyInput) =>
            apiClient.patch<AutoReply>(`/quick-replies/auto/${id}`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auto-replies'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/quick-replies/auto/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auto-replies'] }),
    });

    return {
        ...queryInfo,
        autoReplies: queryInfo.data || [],
        createAutoReply: createMutation.mutateAsync,
        updateAutoReply: updateMutation.mutateAsync,
        deleteAutoReply: deleteMutation.mutateAsync,
        isCreating: createMutation.isPending,
    };
}
