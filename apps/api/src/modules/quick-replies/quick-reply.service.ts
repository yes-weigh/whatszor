import { prisma } from '../../prisma/client';

// ── Shared helpers ────────────────────────────────────────────────

/** Fetches QuickReplies with joined media AND template (latest version + buttons) */
async function fetchWithRelations(workspaceId: string, isAutoReply: boolean) {
    return (prisma.quickReply as any).findMany({
        where: { workspaceId, isAutoReply },
        orderBy: isAutoReply ? { keyword: 'asc' } : { shortcut: 'asc' },
        include: {
            media: true,
            template: {
                include: {
                    versions: {
                        orderBy: { version: 'desc' },
                        take: 1,
                        include: { buttons: true, media: true },
                    },
                },
            },
        },
    });
}

// ── Quick Replies ─────────────────────────────────────────────────

export async function getQuickReplies(workspaceId: string) {
    return fetchWithRelations(workspaceId, false);
}

export async function createQuickReply(workspaceId: string, data: {
    shortcut: string; content: string; mediaId?: string | null;
}) {
    const shortcut = data.shortcut.startsWith('/') ? data.shortcut : `/${data.shortcut}`;
    return (prisma.quickReply as any).create({
        data: { workspaceId, shortcut, content: data.content, mediaId: data.mediaId ?? null, isAutoReply: false },
        include: { media: true },
    });
}

export async function updateQuickReply(workspaceId: string, id: string, data: {
    shortcut?: string; content?: string; mediaId?: string | null;
}) {
    if (data.shortcut) {
        data.shortcut = data.shortcut.startsWith('/') ? data.shortcut : `/${data.shortcut}`;
    }
    return (prisma.quickReply as any).update({
        where: { id, workspaceId },
        data,
        include: { media: true },
    });
}

// ── Auto Replies ──────────────────────────────────────────────────

export async function getAutoReplies(workspaceId: string) {
    return fetchWithRelations(workspaceId, true);
}

export async function createAutoReply(workspaceId: string, data: {
    keyword: string;
    content?: string;
    mediaId?: string | null;
    templateId?: string | null;
}) {
    const keyword = data.keyword.trim().toLowerCase();

    // Template mode: clear text/media
    const isTemplateMode = !!data.templateId;

    return (prisma.quickReply as any).create({
        data: {
            workspaceId,
            shortcut: `__auto__${keyword}`,
            keyword,
            content: isTemplateMode ? '' : (data.content ?? ''),
            mediaId: isTemplateMode ? null : (data.mediaId ?? null),
            templateId: data.templateId ?? null,
            isAutoReply: true,
        },
        include: {
            media: true,
            template: {
                include: {
                    versions: {
                        orderBy: { version: 'desc' },
                        take: 1,
                        include: { buttons: true, media: true },
                    },
                },
            },
        },
    });
}

export async function updateAutoReply(workspaceId: string, id: string, data: {
    keyword?: string;
    content?: string;
    mediaId?: string | null;
    templateId?: string | null;
}) {
    const updateData: any = {};

    if (data.keyword !== undefined) {
        updateData.keyword = data.keyword.trim().toLowerCase();
        updateData.shortcut = `__auto__${updateData.keyword}`;
    }

    // Template mode takes priority — clear text/media
    if ('templateId' in data) {
        if (data.templateId) {
            updateData.templateId = data.templateId;
            updateData.content = '';
            updateData.mediaId = null;
        } else {
            // Clearing the template — restore text/media from payload
            updateData.templateId = null;
            if (data.content !== undefined) updateData.content = data.content;
            if ('mediaId' in data) updateData.mediaId = data.mediaId;
        }
    } else {
        if (data.content !== undefined) updateData.content = data.content;
        if ('mediaId' in data) updateData.mediaId = data.mediaId;
    }

    return (prisma.quickReply as any).update({
        where: { id, workspaceId },
        data: updateData,
        include: {
            media: true,
            template: {
                include: {
                    versions: {
                        orderBy: { version: 'desc' },
                        take: 1,
                        include: { buttons: true, media: true },
                    },
                },
            },
        },
    });
}

export async function deleteQuickReply(workspaceId: string, id: string) {
    return prisma.quickReply.delete({ where: { id, workspaceId } });
}

// ── Inbound keyword matching ──────────────────────────────────────

/** Returns the first matching auto-reply with full relations, or null */
export async function findMatchingAutoReply(workspaceId: string, text: string) {
    const normalized = text.trim().toLowerCase();

    const allAutoReplies = await (prisma.quickReply as any).findMany({
        where: { workspaceId, isAutoReply: true, keyword: { not: null } },
        include: {
            media: true,
            template: {
                include: {
                    versions: {
                        orderBy: { version: 'desc' },
                        take: 1,
                        include: { buttons: true, media: true },
                    },
                },
            },
        },
    });

    return allAutoReplies.find((ar: any) => ar.keyword?.trim().toLowerCase() === normalized) ?? null;
}
