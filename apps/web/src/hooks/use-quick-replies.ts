import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface QuickReply {
    id: string;
    shortcut: string;
    content: string;
    createdAt: string;
}

export function useQuickReplies() {
    const queryClient = useQueryClient();

    const queryInfo = useQuery({
        queryKey: ['quick-replies'],
        queryFn: async () => {
            const res = await api.get('/quick-replies');
            return res.data.data as QuickReply[];
        },
    });

    const createMutation = useMutation({
        mutationFn: async (data: { shortcut: string; content: string }) => {
            const res = await api.post('/quick-replies', data);
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, ...data }: { id: string; shortcut?: string; content?: string }) => {
            const res = await api.patch(`/quick-replies/${id}`, data);
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/quick-replies/${id}`);
        },
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
