// Import from the local generated Prisma output via standard resolution.
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../core/logger';

const log = createLogger({ module: 'prisma' });

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
    const isDev = process.env.NODE_ENV === 'development';

    // Increase connection pool to avoid P2024 "connection pool exhaustion" under load.
    // Default Prisma pool size is num_cpus * 2 + 1 (often just 5 on small machines).
    // We override via datasource URL query params as recommended by Prisma docs.
    const poolLimit = parseInt(process.env.DATABASE_POOL_LIMIT ?? '20', 10);
    const poolTimeout = parseInt(process.env.DATABASE_POOL_TIMEOUT ?? '30', 10);

    const baseUrl = process.env.DATABASE_URL ?? '';
    const separator = baseUrl.includes('?') ? '&' : '?';
    const datasourceUrl = `${baseUrl}${separator}connection_limit=${poolLimit}&pool_timeout=${poolTimeout}`;

    const client = new PrismaClient({
        log: isDev
            ? [{ emit: 'event', level: 'query' }]
            : [],
        datasourceUrl,
    });

    if (isDev) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client as any).$on('query', (e: { query: string; params: string; duration: number }) => {
            if (e.duration > 100) {
                log.warn({ duration: `${e.duration}ms` }, 'Slow query');
            }
        });
    }

    return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export type { PrismaClient };

export async function connectDatabase(): Promise<void> {
    try {
        await prisma.$connect();
        log.info('Database connected successfully');
    } catch (err) {
        log.error({ err }, 'Failed to connect to database');
        throw err;
    }
}

export async function disconnectDatabase(): Promise<void> {
    try {
        await prisma.$disconnect();
        log.info('Database disconnected gracefully');
    } catch (err) {
        log.error({ err }, 'Error during database disconnect');
    }
}
