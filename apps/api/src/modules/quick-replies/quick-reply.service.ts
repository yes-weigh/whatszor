import { prisma } from '../../prisma/client';

// Shared helper: fetch QuickReply records + join media
async function fetchWithMedia(workspaceId: string, isAutoReply: boolean) {
    const records = await (prisma.quickReply as any).findMany({
        where: { workspaceId, isAutoReply },
        orderBy: isAutoReply ? { keyword: 'asc' } : { shortcut: 'asc' },
    });

    const mediaIds = records.map((r: any) => r.mediaId).filter(Boolean) as string[];
    let mediaMap: Record<string, any> = {};
    if (mediaIds.length > 0) {
        const mediaItems = await prisma.media.findMany({ where: { id: { in: mediaIds } } });
        for (const m of mediaItems) mediaMap[m.id] = m;
    }

    return records.map((r: any) => ({ ...r, media: r.mediaId ? (mediaMap[r.mediaId] ?? null) : null }));
}

// ── Quick Replies ────────────────────────────────────────────────

export async function getQuickReplies(workspaceId: string) {
    return fetchWithMedia(workspaceId, false);
}

export async function createQuickReply(workspaceId: string, data: {
    shortcut: string; content: string; mediaId?: string | null;
}) {
    const shortcut = data.shortcut.startsWith('/') ? data.shortcut : `/${data.shortcut}`;
    const qr = await (prisma.quickReply as any).create({
        data: { workspaceId, shortcut, content: data.content, mediaId: data.mediaId ?? null, isAutoReply: false },
    });
    const media = qr.mediaId ? await prisma.media.findUnique({ where: { id: qr.mediaId } }) : null;
    return { ...qr, media };
}

export async function updateQuickReply(workspaceId: string, id: string, data: {
    shortcut?: string; content?: string; mediaId?: string | null;
}) {
    if (data.shortcut) {
        data.shortcut = data.shortcut.startsWith('/') ? data.shortcut : `/${data.shortcut}`;
    }
    const qr = await (prisma.quickReply as any).update({ where: { id, workspaceId }, data });
    const media = qr.mediaId ? await prisma.media.findUnique({ where: { id: qr.mediaId } }) : null;
    return { ...qr, media };
}

// ── Auto Replies ─────────────────────────────────────────────────

export async function getAutoReplies(workspaceId: string) {
    return fetchWithMedia(workspaceId, true);
}

export async function createAutoReply(workspaceId: string, data: {
    keyword: string; content: string; mediaId?: string | null;
}) {
    const keyword = data.keyword.trim().toLowerCase();
    const ar = await (prisma.quickReply as any).create({
        data: {
            workspaceId,
            shortcut: `__auto__${keyword}`, // placeholder — not used for auto-replies
            keyword,
            content: data.content,
            mediaId: data.mediaId ?? null,
            isAutoReply: true,
        },
    });
    const media = ar.mediaId ? await prisma.media.findUnique({ where: { id: ar.mediaId } }) : null;
    return { ...ar, media };
}

export async function updateAutoReply(workspaceId: string, id: string, data: {
    keyword?: string; content?: string; mediaId?: string | null;
}) {
    const updateData: any = {};
    if (data.keyword !== undefined) {
        updateData.keyword = data.keyword.trim().toLowerCase();
        updateData.shortcut = `__auto__${updateData.keyword}`;
    }
    if (data.content !== undefined) updateData.content = data.content;
    if ('mediaId' in data) updateData.mediaId = data.mediaId;

    const ar = await (prisma.quickReply as any).update({ where: { id, workspaceId }, data: updateData });
    const media = ar.mediaId ? await prisma.media.findUnique({ where: { id: ar.mediaId } }) : null;
    return { ...ar, media };
}

export async function deleteQuickReply(workspaceId: string, id: string) {
    return prisma.quickReply.delete({ where: { id, workspaceId } });
}

// ── Inbound keyword matching ──────────────────────────────────────

/** Returns the first matching auto-reply for the given inbound text, or null */
export async function findMatchingAutoReply(workspaceId: string, text: string) {
    const normalized = text.trim().toLowerCase();
    const allAutoReplies = await (prisma.quickReply as any).findMany({
        where: { workspaceId, isAutoReply: true, keyword: { not: null } },
        select: { id: true, keyword: true, content: true, mediaId: true },
    });

    const match = allAutoReplies.find((ar: any) => ar.keyword?.trim().toLowerCase() === normalized);
    if (!match) return null;

    const media = match.mediaId ? await prisma.media.findUnique({ where: { id: match.mediaId } }) : null;
    return { ...match, media };
}
