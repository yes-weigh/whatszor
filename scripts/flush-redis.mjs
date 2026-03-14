/**
 * E2E Test Helper — Flush all Whatszor queues in Redis
 */
import { createClient } from 'redis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Connecting to Redis at: ${REDIS_URL}`);

const client = createClient({ url: REDIS_URL });
await client.connect();

// List all keys before flushing
const keys = await client.keys('*');
console.log(`\nFound ${keys.length} keys in Redis:`);
keys.slice(0, 30).forEach(k => console.log(`  - ${k}`));
if (keys.length > 30) console.log(`  ... and ${keys.length - 30} more`);

console.log('\nFlushing all keys...');
await client.flushAll();

// Confirm it's empty
const remaining = await client.keys('*');
console.log(`\nRemaining keys after flush: ${remaining.length}`);

await client.disconnect();
console.log('\n✅ Redis fully flushed. All queues cleared.');
