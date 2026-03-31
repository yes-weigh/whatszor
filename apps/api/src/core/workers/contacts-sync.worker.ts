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
    const { workspaceId, contacts } = job.data;

    const CHUNK_SIZE = 50;
    const allContacts = (contacts ?? []);
    
    for (let i = 0; i < allContacts.length; i += CHUNK_SIZE) {
        const chunk = allContacts.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (contact: any) => {
            const jid: string = contact.id;
            const lid: string | undefined = contact.lid;
            const name: string = contact.notify || contact.name;
            if (!jid || !name) return;
            if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) return;

            const jidsToUpdate = [jid, lid].filter(Boolean) as string[];
            await prisma.conversation.updateMany({
                where: { workspaceId, providerId: { in: jidsToUpdate } },
                data: { waContactName: name },
            });

            if (lid) {
                const phoneStr = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
                const lidPhone = lid.replace('@lid', '');

                // Fix Contact.phone stuck with @lid value
                const stuckContact = await prisma.contact.findFirst({
                    where: { workspaceId, phone: { in: [lidPhone, lid] } },
                    select: { id: true, phone: true },
                });

                if (stuckContact) {
                    const realPhoneContact = await prisma.contact.findFirst({
                        where: { workspaceId, phone: phoneStr },
                        select: { id: true },
                    });

                    if (!realPhoneContact) {
                        await prisma.contact.update({
                            where: { id: stuckContact.id },
                            data: { phone: phoneStr, firstName: name || undefined },
                        });
                        log.warn({ workspaceId, lid, jid, phone: phoneStr }, 'Fixed Contact.phone from @lid to real phone');
                    }
                }

                // LID conversation migration
                const lidConv = await prisma.conversation.findFirst({
                    where: { workspaceId, providerId: lid },
                    select: { id: true },
                });

                if (lidConv) {
                    const realConv = await prisma.conversation.findFirst({
                        where: { workspaceId, providerId: jid },
                        select: { id: true, lastMessageAt: true },
                    });

                    if (!realConv) {
                        await prisma.conversation.update({
                            where: { id: lidConv.id },
                            data: { providerId: jid, waContactName: name },
                        });
                        log.warn({ workspaceId, lid, jid, name }, 'Migrated LID conversation to real phone JID');
                    } else {
                        try {
                            await prisma.message.updateMany({
                                where: { conversationId: lidConv.id },
                                data: { conversationId: realConv.id },
                            });
                            await prisma.conversation.delete({ where: { id: lidConv.id } });
                            log.warn({ workspaceId, lid, jid }, 'Merged LID conv into real-JID conv and deleted duplicate');
                        } catch (mergeErr) {
                            log.error({ mergeErr, workspaceId, lid, jid }, 'Failed to merge LID conversation — leaving as-is');
                        }
                    }
                }
            }
        }));
    }
}
