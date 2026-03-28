import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
        queryFn: async () => {
            const res = await api.get('/quick-replies/auto');
            return res.data.data as AutoReply[];
        },
    });

    const createMutation = useMutation({
        mutationFn: async (data: CreateAutoReplyInput) => {
            const res = await api.post('/quick-replies/auto', data);
            return res.data.data;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auto-replies'] }),
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, ...data }: UpdateAutoReplyInput) => {
            const res = await api.patch(`/quick-replies/auto/${id}`, data);
            return res.data.data;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auto-replies'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/quick-replies/auto/${id}`);
        },
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
