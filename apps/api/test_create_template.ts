import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // pick a workspace
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) throw new Error('No workspace');

    // try to create a template
    try {
        const root = await prisma.template.create({
            data: {
                workspaceId: workspace.id,
                name: "test_template_123",
                category: "MARKETING",
                language: "en_US",
            }
        });

        const version = await prisma.templateVersion.create({
            data: {
                templateId: root.id,
                version: 1,
                messageText: "Hello this is a simple test",
                footerText: null,
                headerMediaId: null,
                buttons: {
                    create: []
                }
            },
            include: { buttons: true }
        });

        console.log("Success:", JSON.stringify({ root, version }, null, 2));

        // cleanup
        await prisma.template.delete({ where: { id: root.id } });
    } catch (e: any) {
        console.error("Prisma error:");
        console.error(e);
        console.error(e.message);
    }
}

main().finally(() => prisma.$disconnect());
