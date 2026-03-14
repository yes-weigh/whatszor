import { prisma } from './src/prisma/client';
import * as fs from 'fs';

async function main() {
    const contacts = await prisma.contact.findMany({
        where: { id: { in: ["cmmnpk4p308xj7cqtyqagk753", "cmmnpl37g0ajv7cqt7jak4p8i"] } },
    });
    fs.writeFileSync('temp_contacts_utf8.json', JSON.stringify(contacts, null, 2), 'utf-8');
}

main().catch(console.error).finally(() => prisma.$disconnect());
