import { config } from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Force load .env.test before anything else
process.env.NODE_ENV = 'test';
config({ path: path.join(__dirname, '../../.env.test'), override: true });

if (process.env.NODE_ENV !== 'test') {
    throw new Error('NODE_ENV is not test! Setup aborted to prevent data loss.');
}

if (!process.env.DATABASE_URL?.includes('_test')) {
    throw new Error('DATABASE_URL must point to a _test database to prevent data loss.');
}

async function setup() {
    console.log(`[Setup] Environment: ${process.env.NODE_ENV}`);
    console.log(`[Setup] DB: ${process.env.DATABASE_URL}`);
    console.log(`[Setup] Resetting database & pushing schema...`);

    // Override env var for Prisma CLI explicitly
    execSync('npx prisma db push --force-reset --accept-data-loss', { 
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        stdio: 'inherit',
        cwd: path.join(__dirname, '../../')
    });

    console.log(`[Setup] Database setup complete!`);

    const prisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } }
    });

    try {
        console.log(`[Setup] Seeding root workspace...`);
        // Basic seed for workspace so we can hook test campaigns
        const mockWorkspace = await prisma.workspace.upsert({
            where: { id: 'ws_loadtest_1' },
            create: { id: 'ws_loadtest_1', name: 'Loadtest Workspace', slug: 'loadtest-workspace', status: 'ACTIVE' },
            update: {}
        });

        // Basic seed for admin user attached to workspace
        await prisma.user.upsert({
            where: { email: 'test@load.local' },
            create: { id: 'admin_loadtest_1', email: 'test@load.local', passwordHash: 'noop', name: 'Tester' },
            update: {}
        });
        
        console.log(`[Setup] Seed complete.`);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    setup().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

export default setup;
