import { prisma } from './src/prisma/client';
import * as fs from 'fs';

async function main() {
    const messages = await prisma.message.findMany({
        where: { id: { in: ["cmmp26we2000rxtgnr3udpgcf", "cmmp26wfv000txtgndcp6datk"] } },
    });
    fs.writeFileSync('temp_messages_utf8.json', JSON.stringify(messages, null, 2), 'utf-8');
}

main().catch(console.error).finally(() => prisma.$disconnect());
