import { prisma } from '../../prisma/client';

export async function getQuickReplies(workspaceId: string) {
    return prisma.quickReply.findMany({
        where: { workspaceId },
        orderBy: { shortcut: 'asc' },
    });
}

export async function createQuickReply(workspaceId: string, data: { shortcut: string; content: string }) {
    // Ensure shortcut starts with a slash
    const shortcut = data.shortcut.startsWith('/') ? data.shortcut : `/${data.shortcut}`;
    
    return prisma.quickReply.create({
        data: {
            workspaceId,
            shortcut,
            content: data.content,
        },
    });
}

export async function updateQuickReply(workspaceId: string, id: string, data: { shortcut?: string; content?: string }) {
    if (data.shortcut) {
        data.shortcut = data.shortcut.startsWith('/') ? data.shortcut : `/${data.shortcut}`;
    }
    
    return prisma.quickReply.update({
        where: { id, workspaceId },
        data,
    });
}

export async function deleteQuickReply(workspaceId: string, id: string) {
    return prisma.quickReply.delete({
        where: { id, workspaceId },
    });
}
