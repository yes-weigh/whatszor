import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const globalUsersCount = await prisma.globalUser.count();
    const workspacesCount = await prisma.workspace.count();
    const usersCount = await prisma.user.count();
    const contactsCount = await prisma.contact.count();

    console.log('Database verification:');
    console.log(`Global users: ${globalUsersCount} (expected: 1)`);
    console.log(`Workspaces: ${workspacesCount} (expected: 0)`);
    console.log(`Users: ${usersCount} (expected: 0)`);
    console.log(`Contacts: ${contactsCount} (expected: 0)`);

    if (globalUsersCount === 1 && workspacesCount === 0 && usersCount === 0) {
        console.log('SUCCESS: Database is clean and admin is seeded.');
    } else {
        console.error('FAILURE: Database state is not as expected.');
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
