/**
 * History Sync Worker
 *
 * Processes Baileys 'messaging-history.set' payloads.
 * Uses bulk upserts to efficiently handle thousands of chats/messages in one job.
 * Concurrency: 1 (history payloads are large; memory-intensive)
 */
import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { Prisma, MessageDirection, MessageType, MessageStatus } from '@prisma/client';
import { createLogger } from '../logger';

const log = createLogger({ module: 'worker:history-sync' });

const isGroup = (jid: string) =>
    jid.endsWith('@g.us') || jid.endsWith('@newsletter') || jid.endsWith('@broadcast') || jid === 'status@broadcast';

export async function processHistorySync(job: Job): Promise<void> {
    const { workspaceId, sessionId, chats, messages, contacts } = job.data;
    log.info({ workspaceId, sessionId, chats: chats?.length, messages: messages?.length }, 'Processing history sync');

    // ── 1. Build contact name lookup + LID→JID reverse map ────────────────────
    const contactNameMap: Record<string, string> = {};
    const lid2jid = new Map<string, string>();

    for (const c of (contacts ?? [])) {
        const name = c.notify || c.name;
        if (name) {
            if (c.id) contactNameMap[c.id] = name;
            if (c.lid) contactNameMap[c.lid] = name;
        }
        if (c.id && c.lid && !c.id.endsWith('@lid')) {
            lid2jid.set(c.lid, c.id);
        }
    }

    const resolveJid = (jid: string): string => lid2jid.get(jid) ?? jid;

    // ── 2. Collect all unique individual JIDs ─────────────────────────────────
    const jidSet = new Set<string>();
    for (const chat of (chats ?? [])) {
        if (chat.id && !isGroup(chat.id)) jidSet.add(resolveJid(chat.id));
    }
    for (const msg of (messages ?? [])) {
        const jid = msg.key?.remoteJid;
        if (jid && !isGroup(jid)) jidSet.add(resolveJid(jid));
    }

    const jids = Array.from(jidSet);
    if (jids.length === 0) {
        log.info({ workspaceId, sessionId }, 'History sync complete (no valid JIDs)');
        return;
    }

    // ── 3. Bulk upsert conversations ──────────────────────────────────────────
    const CONV_BATCH_SIZE = 1000;
    for (let i = 0; i < jids.length; i += CONV_BATCH_SIZE) {
        const batch = jids.slice(i, i + CONV_BATCH_SIZE);
        await prisma.conversation.createMany({
            data: batch.map(jid => ({
                workspaceId,
                provider: 'WHATSAPP' as const,
                providerId: jid,
                sessionId: sessionId ?? null,
            })),
            skipDuplicates: true,
        });
    }

    const convRows = await prisma.conversation.findMany({
        where: { workspaceId, provider: 'WHATSAPP', providerId: { in: jids }, sessionId: sessionId ?? null },
        select: { id: true, providerId: true, sessionId: true, waContactName: true, lastMessageAt: true, lastMessage: true },
    });
    const convMap = new Map(convRows.map(r => [r.providerId, r]));

    // ── 4. Build + bulk insert messages ──────────────────────────────────────
    type MsgRecord = {
        workspaceId: string;
        conversationId: string;
        remoteId: string;
        direction: MessageDirection;
        type: MessageType;
        content: string | null;
        mediaData: Prisma.InputJsonValue;
        status: MessageStatus;
        createdAt: Date;
        updatedAt: Date;
    };

    const msgRecords: MsgRecord[] = [];
    const latestMsgPerConv = new Map<string, { at: Date; content: string | null; type: string }>();

    for (const msg of (messages ?? [])) {
        const rawJid: string = msg.key?.remoteJid;
        if (!rawJid || isGroup(rawJid)) continue;
        const jid = resolveJid(rawJid);

        const pushName = (msg as { pushName?: string }).pushName;
        if (pushName && !contactNameMap[jid]) contactNameMap[jid] = pushName;

        const conv = convMap.get(jid);
        if (!conv) continue;

        const msgTimestamp = msg.messageTimestamp
            ? new Date(Number(msg.messageTimestamp) * 1000)
            : new Date();

        const textContent = msg.message?.conversation
            || msg.message?.extendedTextMessage?.text
            || msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId
            || null;

        let type: MessageType = 'TEXT';
        let content = textContent;
        let mediaData: any = null;

        if (msg.message?.imageMessage) { type = 'IMAGE'; mediaData = msg.message; }
        else if (msg.message?.videoMessage) { type = 'VIDEO'; mediaData = msg.message; }
        else if (msg.message?.audioMessage) { type = 'AUDIO'; mediaData = msg.message; content = content ?? 'Voice message'; }
        else if (msg.message?.documentMessage) { type = 'DOCUMENT'; mediaData = msg.message; content = content ?? 'Document'; }
        else if (msg.message?.stickerMessage) { type = 'STICKER'; content = '🎭 Sticker'; }
        else if (msg.message?.reactionMessage) { type = 'TEXT'; content = msg.message?.reactionMessage?.text ?? '👍'; }

        if (!content && !mediaData) continue;

        msgRecords.push({
            workspaceId,
            conversationId: conv.id,
            remoteId: msg.key.id || '',
            direction: msg.key.fromMe ? 'OUTBOUND' : 'INBOUND',
            type,
            content,
            mediaData: mediaData as Prisma.InputJsonValue,
            status: msg.key.fromMe ? 'SENT' : 'RECEIVED',
            createdAt: msgTimestamp,
            updatedAt: msgTimestamp,
        });

        if (conv.lastMessage === null || !conv.lastMessageAt || msgTimestamp > conv.lastMessageAt) {
            const prev = latestMsgPerConv.get(conv.id);
            if (!prev || msgTimestamp > prev.at) {
                latestMsgPerConv.set(conv.id, { at: msgTimestamp, content, type });
            }
        }
    }

    // Apply contact names (after messages loop so pushNames are captured)
    const CHUNK_SIZE = 50;
    const contactEntries = Object.entries(contactNameMap);
    for (let i = 0; i < contactEntries.length; i += CHUNK_SIZE) {
        const chunk = contactEntries.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async ([jid, name]) => {
            const conv = convMap.get(jid);
            if (conv) {
                await prisma.conversation.update({
                    where: { id: conv.id },
                    data: { waContactName: name },
                });
            }
        }));
    }

    if (msgRecords.length > 0) {
        const MSG_BATCH_SIZE = 500;
        for (let i = 0; i < msgRecords.length; i += MSG_BATCH_SIZE) {
            await prisma.message.createMany({
                data: msgRecords.slice(i, i + MSG_BATCH_SIZE),
                skipDuplicates: true,
            });
        }
    }

    // ── 5. Update lastMessage/lastMessageAt ───────────────────────────────────
    for (const chat of (chats ?? [])) {
        if (!chat.id || isGroup(chat.id)) continue;
        const conv = convMap.get(chat.id);
        if (!conv || !chat.conversationTimestamp) continue;
        const tsNum = Number(chat.conversationTimestamp);
        if (!tsNum || !isFinite(tsNum)) continue; // skip invalid/zero timestamps
        const chatTs = new Date(tsNum * 1000);
        if (isNaN(chatTs.getTime())) continue;    // belt-and-suspenders guard
        const lm = latestMsgPerConv.get(conv.id);
        if (lm && lm.at >= chatTs) continue;
        if (conv.lastMessage !== null && conv.lastMessageAt && conv.lastMessageAt >= chatTs) continue;
        if (!lm) latestMsgPerConv.set(conv.id, { at: chatTs, content: null, type: 'TEXT' });
    }

    const TYPE_EMOJI: Record<string, string> = {
        IMAGE: '📷 Image', VIDEO: '🎥 Video', AUDIO: '🎤 Voice',
        DOCUMENT: '📎 Document', STICKER: '🎭 Sticker',
    };

    const convUpdates = Array.from(latestMsgPerConv.entries());
    const BATCH = 50;
    for (let i = 0; i < convUpdates.length; i += BATCH) {
        await Promise.all(convUpdates.slice(i, i + BATCH).map(([convId, { at, content, type }]) =>
            prisma.conversation.update({
                where: { id: convId },
                data: { lastMessageAt: at, lastMessage: content ? content.substring(0, 50) : (TYPE_EMOJI[type] ?? null) },
            })
        ));
    }

    log.info({ workspaceId, sessionId, convs: jids.length, msgs: msgRecords.length }, 'History sync complete');
}
