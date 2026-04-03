import { prisma } from '../prisma/client';

async function run() {
    console.log('--- Started Production Contact Cleanup & Source Migration ---');

    console.log('\n[1/2] Deleting Ghost/Group Contacts...');
    // Delete contacts that contain @g.us or @newsletter in their phone number
    const badContacts = await prisma.contact.findMany({
        where: {
            OR: [
                { phone: { contains: '@g.us' } },
                { phone: { contains: '@newsletter' } }
            ]
        },
        select: { id: true, phone: true }
    });

    if (badContacts.length > 0) {
        console.log(`Found ${badContacts.length} ghost contacts to delete.`);
        const badIds = badContacts.map(c => c.id);
        
        // This will cascade and nullify Contact IDs in the messages/conversations, 
        // effectively wiping these contacts out of the CRM system view.
        const deleteRes = await prisma.contact.deleteMany({
            where: { id: { in: badIds } }
        });
        console.log(`Deleted ${deleteRes.count} ghost contacts successfully.`);
    } else {
        console.log('No ghost contacts found.');
    }

    console.log('\n[2/2] Backfilling Source Traceability on Legitimate Contacts...');
    
    // Grab all legitimate contacts that DON'T have customData yet (or don't have source session info)
    const validContacts = await prisma.contact.findMany({
        where: {
            NOT: {
                OR: [
                    { phone: { contains: '@g.us' } },
                    { phone: { contains: '@newsletter' } }
                ]
            }
        },
        include: {
            conversations: {
                take: 1,
                orderBy: { lastMessageAt: 'desc' },
                include: {
                    whatsAppAccount: true
                }
            }
        }
    });

    let updatedCount = 0;
    for (const contact of validContacts) {
        // Find the latest conversation the contact has
        const latestConvo = contact.conversations[0];
        if (!latestConvo || !latestConvo.whatsAppAccount) continue;

        const account = latestConvo.whatsAppAccount;
        
        // Read existing customData
        const existingData = (contact.customData as Record<string, any>) || {};
        
        // If it already has the source session, skip to save DB calls
        if (existingData.sourceSessionName === account.name && existingData.sourcePhoneNumber === account.phoneNumber) {
            continue;
        }

        // Update it
        await prisma.contact.update({
            where: { id: contact.id },
            data: {
                customData: {
                    ...existingData,
                    sourceSessionName: account.name,
                    sourcePhoneNumber: account.phoneNumber,
                }
            }
        });
        updatedCount++;
    }

    console.log(`Successfully backfilled source tracking on ${updatedCount} existing contacts.`);
    console.log('\n--- Migration Completed Successfully ---');
}

run()
    .catch((e) => {
        console.error('Migration failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
