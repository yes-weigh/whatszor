const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const bcrypt = require('./apps/api/node_modules/bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const hash = await bcrypt.hash('admin@1234', 12);
    const admin = await prisma.globalUser.upsert({
        where: { email: 'admin@whatszor.com' },
        update: {},
        create: {
            email: 'admin@whatszor.com',
            name: 'Super Admin',
            password: hash,
            role: 'SUPER_ADMIN'
        }
    });
    console.log('Admin user ready:', admin.email, '| Role:', admin.role);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
