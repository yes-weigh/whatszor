const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.globalUser.findMany();
    console.log("Global Users:", users);
    const standardUsers = await prisma.user.findMany();
    console.log("Standard Users:", standardUsers);
}
main().catch(console.error).finally(() => prisma.$disconnect());
