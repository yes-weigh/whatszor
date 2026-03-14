import { prisma } from './src/prisma/client';

async function main() {
    const campaign = await prisma.campaign.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { members: true },
    });
    console.log(JSON.stringify(campaign, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
