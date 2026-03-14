/**
 * Flush all Whatszor Redis queues using ioredis
 * Run from the project root: node scripts/flush-redis.cjs
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../apps/api/.env') });

let Redis;
try {
    Redis = require(path.join(__dirname, '../node_modules/.pnpm/ioredis@5.6.0/node_modules/ioredis'));
} catch(e) {
    try {
        Redis = require(path.join(__dirname, '../apps/api/node_modules/ioredis'));
    } catch(e2) {
        // Try pnpm workspace
        const glob = require('child_process').execSync('find . -path "*/ioredis/built/index.js" -maxdepth 7 2>/dev/null | head -1', { cwd: path.join(__dirname, '..'), encoding: 'utf-8' });
        if (glob.trim()) {
            Redis = require(path.join(__dirname, '..', glob.trim()));
        } else {
            console.error('Could not find ioredis. Queues must be flushed manually.');
            process.exit(1);
        }
    }
}

const Default = Redis.default || Redis;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Connecting to Redis at: ${REDIS_URL}`);

const client = new Default(REDIS_URL);

client.on('connect', async () => {
    console.log('Connected.');
    const keys = await client.keys('*');
    console.log(`Found ${keys.length} keys in Redis.`);
    if (keys.length > 0) {
        keys.slice(0, 20).forEach(k => console.log(`  - ${k}`));
    }
    
    await client.flushall();
    const remaining = await client.keys('*');
    console.log(`\n✅ Done. Remaining keys: ${remaining.length}`);
    client.disconnect();
    process.exit(0);
});

client.on('error', (err) => {
    console.error('Redis connection error:', err.message);
    console.log('Redis may not be running locally. Start it first, or skip to Phase 2.');
    process.exit(1);
});
