/**
 * fix-lid-duplicates.ts
 *
 * One-shot migration: reads all debug-dump files to build a complete
 * LID→phone mapping, then merges every @lid conversation row in the DB
 * into its real phone-number counterpart.
 *
 * Run with:
 *   npx tsx scripts/fix-lid-duplicates.ts
 *
 * Safe to run multiple times (idempotent).
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DUMP_DIR = path.join(__dirname, '..', 'debug-dumps');

// ── Build LID→phone map from all dump files ───────────────────────────────────
function buildLidMap(): Map<string, string> {
    const lid2phone = new Map<string, string>();

    if (!fs.existsSync(DUMP_DIR)) {
        console.warn(`[warn] debug-dumps dir not found: ${DUMP_DIR}`);
        return lid2phone;
    }

    const files = fs.readdirSync(DUMP_DIR);

    // 1. contacts-upsert dumps: { id, name, lid }
    for (const file of files.filter(f => f.startsWith('contacts-upsert-dump'))) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(DUMP_DIR, file), 'utf-8'));
            for (const c of (Array.isArray(data) ? data : [])) {
                if (c.id && c.lid && !c.id.endsWith('@lid') && c.lid.endsWith('@lid')) {
                    lid2phone.set(c.lid, c.id);
                }
            }
            console.log(`[info] contacts-upsert: ${file} → ${lid2phone.size} total mappings`);
        } catch (e) {
            console.warn(`[warn] Could not parse ${file}: ${e}`);
        }
    }

    // 2. history dumps: chats[] with pnJid field
    for (const file of files.filter(f => f.startsWith('history-dump'))) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(DUMP_DIR, file), 'utf-8'));
            // history dumps are objects with chats/messages/contacts keys, or plain arrays
            const chats: any[] = Array.isArray(data) ? data : (data.chats ?? []);
            const contacts: any[] = Array.isArray(data) ? [] : (data.contacts ?? []);

            for (const chat of chats) {
                // pnJid: real phone number for this @lid chat
                if (chat.id?.endsWith('@lid') && chat.pnJid && !chat.pnJid.endsWith('@lid')) {
                    lid2phone.set(chat.id, chat.pnJid);
                }
                if (chat.accountLid?.endsWith('@lid') && chat.pnJid && !chat.pnJid.endsWith('@lid')) {
                    lid2phone.set(chat.accountLid, chat.pnJid);
                }
                // phoneNumber field in some structs
                if (chat.id?.endsWith('@lid') && chat.phoneNumber && !chat.phoneNumber.endsWith('@lid')) {
                    lid2phone.set(chat.id, chat.phoneNumber);
                }
            }
            for (const c of contacts) {
                if (c.id && c.lid && !c.id.endsWith('@lid') && c.lid.endsWith('@lid')) {
                    lid2phone.set(c.lid, c.id);
                }
                if (c.phoneNumber && !c.phoneNumber.endsWith('@lid') && c.id?.endsWith('@lid')) {
                    lid2phone.set(c.id, c.phoneNumber);
                }
            }
            console.log(`[info] history-dump:  ${file} → ${lid2phone.size} total mappings`);
        } catch (e) {
            console.warn(`[warn] Could not parse ${file}: ${e}`);
        }
    }

    // 3. contacts-update dumps (smaller, but capture runtime updates)
    for (const file of files.filter(f => f.startsWith('contacts-update-dump'))) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(DUMP_DIR, file), 'utf-8'));
            for (const c of (Array.isArray(data) ? data : [data])) {
                if (c.id && c.lid && !c.id.endsWith('@lid') && c.lid.endsWith('@lid')) {
                    lid2phone.set(c.lid, c.id);
                }
            }
        } catch (_) { /* ignore */ }
    }

    return lid2phone;
}

// ── Merge one @lid conversation into a real conversation ──────────────────────
async function mergeConversation(lidConvId: string, realConvId: string, lid: string, phone: string) {
    // Move messages from ghost → real
    const messages = await prisma.message.findMany({
        where: { conversationId: lidConvId },
        select: { id: true, remoteId: true },
    });

    let moved = 0, dropped = 0;
    for (const msg of messages) {
        try {
            await prisma.message.update({
                where: { id: msg.id },
                data: { conversationId: realConvId },
            });
            moved++;
        } catch (e: any) {
            if (e.code === 'P2002') {
                // Exact duplicate — drop ghost copy
                await prisma.message.delete({ where: { id: msg.id } }).catch(() => {});
                dropped++;
            }
        }
    }

    // Forward contactId if realConv has none
    const [lidConv, realConv] = await Promise.all([
        prisma.conversation.findUnique({ where: { id: lidConvId }, select: { contactId: true } }),
        prisma.conversation.findUnique({ where: { id: realConvId }, select: { contactId: true } }),
    ]);
    if (lidConv && realConv && !realConv.contactId && lidConv.contactId) {
        await prisma.conversation.update({ where: { id: realConvId }, data: { contactId: lidConv.contactId } }).catch(() => {});
    }

    // Delete the ghost
    await prisma.conversation.delete({ where: { id: lidConvId } });

    console.log(`[merge] ${lid} → ${phone} | moved: ${moved}, dropped duplicates: ${dropped}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('=== fix-lid-duplicates ===\n');

    const lid2phone = buildLidMap();
    console.log(`\n[info] Built LID map: ${lid2phone.size} entries\n`);

    if (lid2phone.size === 0) {
        console.log('[warn] No LID mappings found. Exiting.');
        return;
    }

    // Find all @lid conversation rows in the DB
    const lidConversations = await prisma.conversation.findMany({
        where: { provider: 'WHATSAPP', providerId: { endsWith: '@lid' } },
        select: { id: true, providerId: true, workspaceId: true, sessionId: true },
    });

    console.log(`[info] Found ${lidConversations.length} @lid conversation rows in DB\n`);

    let merged = 0, renamed = 0, unmapped = 0;

    for (const lidConv of lidConversations) {
        const phone = lid2phone.get(lidConv.providerId);
        if (!phone) {
            console.log(`[skip] No mapping for ${lidConv.providerId}`);
            unmapped++;
            continue;
        }

        // Find real conversation row (same workspace + session)
        const realConv = await prisma.conversation.findUnique({
            where: {
                workspaceId_provider_providerId_sessionId: {
                    workspaceId: lidConv.workspaceId,
                    provider: 'WHATSAPP',
                    providerId: phone,
                    sessionId: lidConv.sessionId ?? '',
                },
            },
            select: { id: true },
        });

        if (realConv) {
            // Both exist → drain + delete ghost
            await mergeConversation(lidConv.id, realConv.id, lidConv.providerId, phone);
            merged++;
        } else {
            // Only @lid exists → safe rename
            await prisma.conversation.update({
                where: { id: lidConv.id },
                data: { providerId: phone },
            });
            console.log(`[rename] ${lidConv.providerId} → ${phone}`);
            renamed++;
        }
    }

    console.log(`\n=== Done ===`);
    console.log(`  Merged (drained ghost): ${merged}`);
    console.log(`  Renamed (safe):         ${renamed}`);
    console.log(`  Unmapped (no dump data): ${unmapped}`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
