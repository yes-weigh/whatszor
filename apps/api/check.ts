import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const campaigns = await prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 2,
        include: { audience: true, whatsappAccount: true }
    });
    console.log(JSON.stringify(campaigns, null, 2));
}
main().finally(() => prisma.$disconnect());
