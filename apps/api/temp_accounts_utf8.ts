import { prisma } from './src/prisma/client';
import * as fs from 'fs';

async function main() {
    const accs = await prisma.whatsAppAccount.findMany();
    fs.writeFileSync('temp_accounts_utf8.json', JSON.stringify(accs, null, 2), 'utf-8');
}

main().catch(console.error).finally(() => prisma.$disconnect());
