/**
 * Contacts Sync Worker
 *
 * Backfills waContactName from the Baileys device address book.
 * Also migrates conversations stored under @lid JIDs to use the real phone JID.
 * Concurrency: 2
 */
import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { createLogger } from '../logger';

const log = createLogger({ module: 'worker:contacts-sync' });

export async function processContactsSync(job: Job): Promise<void> {
    const { workspaceId, sessionId, contacts } = job.data;

    const CHUNK_SIZE = 50;
    const allContacts = (contacts ?? []);
    
    for (let i = 0; i < allContacts.length; i += CHUNK_SIZE) {
        const chunk = allContacts.slice(i, i + CHUNK_SIZE);
        
        // 1. Bulk Update Contact Names
        const jids: string[] = [];
        for (const contact of chunk) {
            if (contact.id && contact.notify && !contact.id.endsWith('@g.us') && !contact.id.endsWith('@newsletter')) {
                jids.push(contact.id);
                if (contact.lid) jids.push(contact.lid);
            }
        }

        if (jids.length > 0) {
            // Because names vary per contact, we can't do one big updateMany for all names easily.
            // But we can batch the updates sequentially instead of Promise.all to prevent DB storms.
            for (const contact of chunk) {
                const jid = contact.id;
                const name = contact.notify || contact.name;
                if (!name || !jid) continue;
                if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) continue;

                await prisma.conversation.updateMany({
                    where: { workspaceId, providerId: { in: [jid, contact.lid].filter(Boolean) as string[] } },
                    data: { waContactName: name },
                });
            }
        }

        // 2. Safely Process LID Migrations Sequentially
        for (const contact of chunk) {
            let jid: string = contact.id;
            let lid: string | undefined = contact.lid;
            const name: string = contact.notify || contact.name;
            const phoneNumber: string | undefined = contact.phoneNumber;
            const remoteJidAlt: string | undefined = contact.remoteJidAlt ?? (contact.key as any)?.remoteJidAlt;

            // Handle objects where 'id' is the lid, but we have 'phoneNumber' or 'remoteJidAlt'
            if (jid && jid.endsWith('@lid') && phoneNumber && phoneNumber.endsWith('@s.whatsapp.net')) {
                lid = jid;
                jid = phoneNumber;
            } else if (jid && jid.endsWith('@lid') && remoteJidAlt && remoteJidAlt.endsWith('@s.whatsapp.net')) {
                lid = jid;
                jid = remoteJidAlt;
            } else if (lid && lid.endsWith('@lid') && remoteJidAlt && remoteJidAlt.endsWith('@s.whatsapp.net')) {
                jid = remoteJidAlt;
            }

            if (!jid || !lid || jid.endsWith('@g.us')) continue;

            try {
                const phoneStr = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
                const lidPhone = lid.replace('@lid', '');

                // A. Heal Contact
                const stuckContact = await prisma.contact.findFirst({
                    where: { workspaceId, phone: { in: [lidPhone, lid] } },
                    select: { id: true }
                });

                if (stuckContact) {
                    const realContact = await prisma.contact.findFirst({ where: { workspaceId, phone: phoneStr } });
                    if (!realContact) {
                        await prisma.contact.update({
                            where: { id: stuckContact.id },
                            data: { phone: phoneStr, firstName: name || undefined },
                        });
                    } else {
                        // Merge conversations attached to the stuck contact to the real contact
                        await prisma.conversation.updateMany({
                            where: { contactId: stuckContact.id },
                            data: { contactId: realContact.id },
                        });
                        // Delete the stuck contact
                        await prisma.contact.delete({ where: { id: stuckContact.id } });
                    }
                }

                // B. Heal Conversation
                // Scope by sessionId to avoid cross-session collisions in multi-session setups
                const sessionFilter = sessionId ? { sessionId } : {};
                const lidConv = await prisma.conversation.findFirst({
                    where: { workspaceId, providerId: lid, ...sessionFilter },
                    select: { id: true, sessionId: true, contactId: true },
                });

                if (lidConv) {
                    const realConv = await prisma.conversation.findFirst({
                        where: { workspaceId, providerId: jid, ...(lidConv.sessionId ? { sessionId: lidConv.sessionId } : {}) },
                        select: { id: true, contactId: true },
                    });

                    if (!realConv) {
                        // Safe rename — no collision possible
                        await prisma.conversation.updateMany({
                            where: { id: lidConv.id },
                            data: { providerId: jid, waContactName: name || undefined },
                        });
                    } else {
                        // Both exist — drain messages from ghost then delete it
                        const lidMessages = await prisma.message.findMany({
                            where: { conversationId: lidConv.id },
                            select: { id: true }
                        });
                        
                        for (const msg of lidMessages) {
                            try {
                                await prisma.message.update({
                                    where: { id: msg.id },
                                    data: { conversationId: realConv.id }
                                });
                            } catch (mergeErr: any) {
                                if (mergeErr.code === 'P2002') {
                                    // Exact duplicate in realConv — drop ghost copy
                                    await prisma.message.delete({ where: { id: msg.id } }).catch(() => {});
                                }
                            }
                        }

                        // Forward contactId if realConv has none
                        if (!realConv.contactId && lidConv.contactId) {
                            await prisma.conversation.update({
                                where: { id: realConv.id },
                                data: { contactId: lidConv.contactId },
                            }).catch(() => {});
                        }

                        await prisma.conversation.delete({ where: { id: lidConv.id } });
                    }
                }
            } catch (err) {
                log.error({ err, jid, lid }, 'Error migrating LID in contacts-sync');
            }
        }
    }
}
