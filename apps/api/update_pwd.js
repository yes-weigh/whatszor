const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const hash = await bcrypt.hash('admin@1234', 12);
    const updated = await prisma.globalUser.update({
        where: { email: 'admin@whatszor.com' },
        data: { password: hash }
    });
    console.log("Updated admin password successfully to admin@1234. Role:", updated.role);
}

main().catch(console.error).finally(() => prisma.$disconnect());
