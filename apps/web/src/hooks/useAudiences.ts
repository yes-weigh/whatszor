'use client';

import * as React from 'react';
import { audienceApi, type Audience, type AudienceMember } from '@/lib/audience.api';
import toast from 'react-hot-toast';

// ── List hook ──────────────────────────────────────────────────────────────────

export function useAudiences() {
    const [audiences, setAudiences] = React.useState<Audience[]>([]);
    const [total, setTotal] = React.useState(0);
    const [isLoading, setIsLoading] = React.useState(true);

    const load = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await audienceApi.list();
            setAudiences(res.items);
            setTotal(res.total);
        } catch {
            toast.error('Failed to load audiences');
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => { load(); }, [load]);

    const createAudience = React.useCallback(async (data: {
        name: string;
        description?: string;
        contactIds?: string[];
        leadListId?: string;
    }) => {
        const audience = await audienceApi.create(data);
        setAudiences(prev => [audience, ...prev]);
        setTotal(prev => prev + 1);
        toast.success(`Audience "${audience.name}" created`);
        return audience;
    }, []);

    const deleteAudience = React.useCallback(async (id: string, name: string) => {
        await audienceApi.delete(id);
        setAudiences(prev => prev.filter(a => a.id !== id));
        setTotal(prev => prev - 1);
        toast.success(`Audience "${name}" deleted`);
    }, []);

    const updateAudience = React.useCallback(async (id: string, data: { name?: string; description?: string | null }) => {
        const updated = await audienceApi.update(id, data);
        setAudiences(prev => prev.map(a => a.id === id ? updated : a));
        toast.success('Audience updated');
        return updated;
    }, []);

    return { audiences, total, isLoading, createAudience, deleteAudience, updateAudience, refresh: load };
}

// ── Detail hook (single audience + members) ────────────────────────────────────

export function useAudienceDetail(id: string) {
    const [audience, setAudience] = React.useState<Audience | null>(null);
    const [members, setMembers] = React.useState<AudienceMember[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSyncing, setIsSyncing] = React.useState(false);

    const load = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const [aud, mems] = await Promise.all([
                audienceApi.get(id),
                audienceApi.listMembers(id),
            ]);
            setAudience(aud);
            setMembers(mems);
        } catch {
            toast.error('Failed to load audience');
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    React.useEffect(() => { load(); }, [load]);

    const syncFromLeadList = React.useCallback(async (leadListId?: string) => {
        setIsSyncing(true);
        try {
            const result = await audienceApi.importFromLeadList(id, { leadListId });
            toast.success(`Synced ${result.synced} contacts (${result.skipped} skipped — already in audience)`);
            await load();
        } catch {
            toast.error('Sync failed. Check that leads have been converted to contacts first.');
        } finally {
            setIsSyncing(false);
        }
    }, [id, load]);

    const removeMembers = React.useCallback(async (contactIds: string[]) => {
        await audienceApi.removeMembers(id, contactIds);
        setMembers(prev => prev.filter(m => !contactIds.includes(m.contact.id)));
        if (audience) {
            setAudience({ ...audience, memberCount: audience.memberCount - contactIds.length });
        }
        toast.success(`Removed ${contactIds.length} member(s)`);
    }, [id, audience]);

    return { audience, members, isLoading, isSyncing, syncFromLeadList, removeMembers, refresh: load };
}
