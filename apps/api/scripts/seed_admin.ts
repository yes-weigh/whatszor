import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const hash = await bcrypt.hash('admin@1234', 12);
    const admin = await prisma.globalUser.upsert({
        where: { email: 'admin@whatsvue.com' },
        update: {},
        create: {
            email: 'admin@whatsvue.com',
            name: 'Super Admin',
            password: hash,
            role: 'SUPER_ADMIN'
        }
    });
    console.log('✅ Admin user ready:', admin.email, '| Role:', admin.role, '| ID:', admin.id);
    await prisma.$disconnect();
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
