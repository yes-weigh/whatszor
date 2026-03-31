import { prisma } from '../prisma/client';
import { getRedisClient } from '../core/redis';
import { env } from '../env';

async function main() {
    console.log('🚀 Pre-flight check starting...');
    
    // 1. Env validation
    // Fastify env validation already runs when env is imported,
    // but we can add explicit checks here if needed.
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
    if (!env.REDIS_URL) throw new Error('REDIS_URL is missing');
    
    // 2. DB check
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connected');
    } catch (err) {
        throw new Error(`Database connection failed: ${err}`);
    }
    
    // 3. Redis check
    try {
        const redis = getRedisClient();
        await redis.ping();
        console.log('✅ Redis connected');
    } catch (err) {
        throw new Error(`Redis connection failed: ${err}`);
    }
    
    // 4. Verify critical tables exist (basic migration check)
    try {
        await prisma.workspace.count();
        console.log('✅ Database migrations verified');
    } catch (err) {
        throw new Error(`Database migrations check failed, please run 'npm run db:deploy' first. Error: ${err}`);
    }
    
    console.log('🏁 Pre-flight successful. Ready for liftoff.');
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Pre-flight failed:', err.message || err);
    process.exit(1);
});
