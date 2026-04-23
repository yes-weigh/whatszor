import { api } from './api';

export interface LeadList {
    id: string;
    name: string | null;
    query: string;
    status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
    totalFound: number;
    withPhone: number;
    converted: number;
    jobId: string | null;
    processingStartedAt: string | null;
    completedAt: string | null;
    errorReason: string | null;
    createdAt: string;
}

export interface Lead {
    id: string;
    name: string;
    phone: string | null;
    hasPhone: boolean;
    address: string | null;
    website: string | null;
    googlePlaceId: string | null;
    status: 'RAW' | 'CONVERTED' | 'SKIPPED';
    contactId: string | null;
    createdAt: string;
    _isLocked?: boolean;
}

export interface SearchPreviewResult {
    estimatedCount: number;
    sample: {
        placeId: string;
        displayName: string;
        address?: string;
    }[];
}

export interface ConvertResult {
    converted: number;
    skipped: number;
    failed: number;
    skippedReasons: Record<string, number>;
    audienceId: string | null;
}

export interface LeadSuggestion {
    keyword: string;
    location: string;
}

export const leadGenerationApi = {
    previewLeads: async (query: string): Promise<SearchPreviewResult> => {
        const res = await api.post('/lead-generation/preview', { query });
        return res.data;
    },

    generateLeads: async (query: string, fetchMaximum?: boolean): Promise<{ leadListId: string, status: string, message: string }> => {
        const res = await api.post('/lead-generation/search', { query, fetchMaximum });
        return res.data;
    },

    batchGenerateLeads: async (rootQuery: string, segments: { keyword: string, location: string }[]): Promise<{ audienceId: string, message: string }> => {
        const res = await api.post('/lead-generation/batch', { rootQuery, segments });
        return res.data;
    },

    getLeadLists: async (skip: number = 0, take: number = 20): Promise<{ items: LeadList[], total: number }> => {
        const res = await api.get('/lead-generation', { params: { skip, take } });
        return res.data;
    },

    getLeadList: async (id: string, params: { skip?: number, take?: number, filter?: string } = {}): Promise<LeadList & { leads: Lead[], leadsTotal: number }> => {
        const res = await api.get(`/lead-generation/${id}`, { params });
        return res.data;
    },

    convertLeads: async (id: string, params: { leadIds?: string[], skipExisting?: boolean, createAudience?: boolean, audienceId?: string } = {}): Promise<ConvertResult> => {
        const res = await api.post(`/lead-generation/${id}/convert`, params);
        return res.data;
    },

    deleteLeadList: async (id: string): Promise<{ message: string }> => {
        const res = await api.delete(`/lead-generation/${id}`);
        return res.data;
    },

    suggestLeadQueries: async (keyword: string, location: string): Promise<{ suggestions: LeadSuggestion[] }> => {
        const res = await api.post('/ai/lead-suggestions', { keyword, location });
        return res.data;
    },

    planOptimizerCampaign: async (params: { city: string; cityLat?: number; cityLng?: number; keywords: string[]; maxBudget: number }) => {
        const res = await api.post('/lead-generation/optimizer/plan', params);
        return res.data;
    },

    executeOptimizerCampaign: async (planBatchId: string, selectedPlanIds: string[]) => {
        const res = await api.post('/lead-generation/optimizer/execute', { planBatchId, selectedPlanIds });
        return res.data;
    },

    getOptimizerPlans: async (planBatchId: string) => {
        const res = await api.get(`/lead-generation/optimizer/plans/${planBatchId}`);
        return res.data;
    },

    smartSearch: async (query: string): Promise<{
        audienceId: string;
        keyword: string;
        city: string;
        synonymsUsed: string[];
        totalSearches: number;
        message: string;
    }> => {
        const res = await api.post('/lead-generation/smart-search', { query });
        return res.data;
    },
};
