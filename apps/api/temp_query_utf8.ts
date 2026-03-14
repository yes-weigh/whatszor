import { prisma } from './src/prisma/client';
import * as fs from 'fs';

async function main() {
    const campaign = await prisma.campaign.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { members: true },
    });
    fs.writeFileSync('temp_query_output_utf8.json', JSON.stringify(campaign, null, 2), 'utf-8');
}

main().catch(console.error).finally(() => prisma.$disconnect());
