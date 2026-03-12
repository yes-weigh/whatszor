// Import from the local generated Prisma output via a tsconfig path alias.
// The alias "$prisma/client" is mapped to "../node_modules/.prisma/client"
// in tsconfig.json, giving TypeScript the correct schema-specific types
// (including RefreshToken) and bypassing pnpm hoisting issues.
import { PrismaClient } from '$prisma/client';
import { logger } from '../core/logger';

const log = logger.child({ module: 'prisma' });

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
    const isDev = process.env.NODE_ENV === 'development';

    const client = new PrismaClient({
        log: isDev
            ? [{ emit: 'event', level: 'query' }]
            : [],
    });

    if (isDev) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client as any).$on('query', (e: { query: string; params: string; duration: number }) => {
            if (e.duration > 100) {
                log.warn({ query: e.query, params: e.params, duration: `${e.duration}ms` }, 'Slow query');
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
    await prisma.$connect();
    log.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
    await prisma.$disconnect();
    log.info('Database disconnected');
}
