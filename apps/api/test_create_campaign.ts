import { prisma } from './src/prisma/client';
import { createCampaign } from './src/modules/campaign/campaign.service';

async function test() {
    try {
        console.log("Fetching a workspace...");
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) throw new Error("No workspace");
        
        console.log("Fetching a template...");
        const template = await prisma.template.findFirst({ where: { workspaceId: workspace.id } });
        
        console.log("Fetching a contact...");
        const contact = await prisma.contact.findFirst({ where: { workspaceId: workspace.id } });
        
        console.log("Fetching a WhatsApp account...");
        const waAccount = await prisma.whatsAppAccount.findFirst({ where: { workspaceId: workspace.id } });
        
        console.log("Simulating Campaign Creation Payload...");
        const payload = {
            name: "Test Campaign " + Date.now(),
            templateId: template?.id || null,
            templateLanguage: "en",
            whatsappAccountId: waAccount?.id || null,
            scheduledAt: null,
            contactIds: contact ? [contact.id] : [],
        };

        console.log("Calling API Logic...");
        const campaign = await createCampaign(workspace.id, payload as any);
        console.log("Success:", campaign.id);
    } catch(err) {
        console.error("FAIL:", err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
