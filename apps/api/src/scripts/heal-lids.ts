/**
 * heal-lids.ts
 *
 * Retroactive LID → real phone resolution.
 * Reads the live Baileys in-memory contactsStore via the running API's
 * /health/heal-lids endpoint (which has access to the waManager instance).
 * 
 * This script also checks store size before attempting to heal.
 *
 * Run: npx ts-node --project tsconfig.json src/scripts/heal-lids.ts
 */
import { prisma } from '../prisma/client';
import { waManager } from '../modules/whatsapp/whatsapp.service';

async function main() {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║   Retroactive LID Healing Script          ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    const sessions = await prisma.whatsAppAccount.findMany({
        select: { sessionId: true, phoneNumber: true, status: true },
    });
    console.log(`Sessions found: ${sessions.length}`);

    // 1. Check how many contacts are in the Baileys memory store
    let totalContacts = 0;
    let totalLidMappings = 0;
    const globalLidMap = new Map<string, string>(); // lid → real JID

    for (const session of sessions) {
        const store = waManager.getContactsStore(session.sessionId);
        let lidCount = 0;
        for (const [key, val] of store.entries()) {
            if (key.endsWith('@lid') && !val.jid.endsWith('@lid')) {
                globalLidMap.set(key, val.jid);
                lidCount++;
            }
        }
        console.log(`  [${session.phoneNumber}] store size: ${store.size}, LID mappings: ${lidCount}`);
        totalContacts += store.size;
        totalLidMappings += lidCount;
    }

    console.log(`\nTotal in-memory contacts: ${totalContacts}`);
    console.log(`Total LID → phone mappings: ${totalLidMappings}`);

    if (totalLidMappings === 0) {
        console.log('\n⚠️  No LID mappings in memory yet.');
        console.log('   WhatsApp typically syncs contacts 30-120s after session connects.');
        console.log('   Please wait a few more minutes and run this script again.\n');
        return;
    }

    // 2. Find all @lid conversations
    const lidConvs = await prisma.conversation.findMany({
        where: { providerId: { endsWith: '@lid' } },
        select: { id: true, providerId: true, sessionId: true, waContactName: true },
    });
    console.log(`\n@lid conversations in DB: ${lidConvs.length}`);

    if (lidConvs.length === 0) {
        console.log('Nothing to heal. All conversations already resolved!');
        return;
    }

    // 3. Match and heal
    let healed = 0;
    let notResolved = 0;
    const updates: Array<{ id: string; old: string; newJid: string; phone: string }> = [];

    for (const conv of lidConvs) {
        const resolved = globalLidMap.get(conv.providerId);
        if (resolved) {
            const phone = resolved.replace('@s.whatsapp.net', '').replace('@c.us', '');
            updates.push({ id: conv.id, old: conv.providerId, newJid: resolved, phone });
        } else {
            notResolved++;
        }
    }

    console.log(`Can resolve now:     ${updates.length}`);
    console.log(`Still unresolvable:  ${notResolved} (these will auto-heal on next incoming message)`);

    if (updates.length === 0) {
        console.log('\nNo matches found between DB lids and memory store. Exiting.');
        return;
    }

    // 4. Batch update DB in chunks of 50
    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        await Promise.all(
            chunk.map(u =>
                prisma.conversation.update({
                    where: { id: u.id },
                    data: { providerId: u.newJid },
                }).then(() => {
                    // Also heal any CRM contact that was created with the @lid as phone
                    return prisma.contact.updateMany({
                        where: { 
                            workspaceId: { not: '' },
                            phone: u.old.replace('@lid', ''),
                        },
                        data: { phone: u.phone },
                    });
                })
            )
        );
        healed += chunk.length;
        process.stdout.write(`  Progress: ${healed}/${updates.length}\r`);
    }

    console.log(`\n\n✅ Healed ${healed} conversations (and linked contacts) from @lid → real phone`);
    console.log(`⚠️  ${notResolved} lids still need a new incoming message to resolve.\n`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
