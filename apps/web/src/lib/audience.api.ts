import { api } from './api';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Audience {
    id: string;
    name: string;
    description: string | null;
    sourceType: 'manual' | 'lead_list';
    leadListId: string | null;
    memberCount: number;
    createdAt: string;
    updatedAt: string;
    leadList?: { name: string | null; query: string } | null;
    _count?: { campaigns: number };
}

export interface AudienceMember {
    id: string;
    sourceType: string;
    createdAt: string;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        email: string | null;
    };
}

// ── API ────────────────────────────────────────────────────────────────────────

export const audienceApi = {
    list: async (skip = 0, take = 50): Promise<{ items: Audience[]; total: number }> => {
        const res = await api.get('/crm/audiences', { params: { skip, take } });
        return res.data;
    },

    create: async (data: {
        name: string;
        description?: string;
        contactIds?: string[];
        leadListId?: string;
    }): Promise<Audience> => {
        const res = await api.post('/crm/audiences', data);
        return res.data;
    },

    get: async (id: string): Promise<Audience> => {
        const res = await api.get(`/crm/audiences/${id}`);
        return res.data;
    },

    update: async (id: string, data: { name?: string; description?: string | null }): Promise<Audience> => {
        const res = await api.patch(`/crm/audiences/${id}`, data);
        return res.data;
    },

    delete: async (id: string): Promise<{ deleted: boolean }> => {
        const res = await api.delete(`/crm/audiences/${id}`);
        return res.data;
    },

    listMembers: async (id: string, skip = 0, take = 100): Promise<AudienceMember[]> => {
        const res = await api.get(`/crm/audiences/${id}/members`, { params: { skip, take } });
        return res.data;
    },

    addMembers: async (id: string, contactIds: string[]): Promise<{ added: number }> => {
        const res = await api.post(`/crm/audiences/${id}/members`, { contactIds, sourceType: 'manual' });
        return res.data;
    },

    removeMembers: async (id: string, contactIds: string[]): Promise<{ removed: number }> => {
        const res = await api.delete(`/crm/audiences/${id}/members`, { data: { contactIds } });
        return res.data;
    },

    importFromLeadList: async (
        id: string,
        opts: { leadListId?: string; skipExisting?: boolean } = {},
    ): Promise<{ synced: number; skipped: number }> => {
        const res = await api.post(`/crm/audiences/${id}/import-lead-list`, opts);
        return res.data;
    },
};
