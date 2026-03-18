import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function generateKeys(count: number, planTier: any, durationDays: number) {
    const admin = await prisma.globalUser.findFirst({ where: { role: 'SUPER_ADMIN' } });
    const adminId = admin?.id || 'SYSTEM';

    const keys = [];
    for (let i = 0; i < count; i++) {
        const prefix = `WVUE-${planTier}`;
        const randomHex = crypto.randomBytes(6).toString('hex').toUpperCase();
        const p1 = randomHex.slice(0, 4);
        const p2 = randomHex.slice(4, 8);
        const p3 = randomHex.slice(8, 12);
        const finalKey = `${prefix}-${p1}-${p2}-${p3}`;

        keys.push({
            key: finalKey,
            planTier,
            durationDays,
            generatedById: adminId,
        });
    }

    await prisma.licenseKey.createMany({
        data: keys,
    });

    return keys;
}

async function main() {
    console.log('🔄 Generating 2 PRO license keys (365 days)...');
    const keys = await generateKeys(2, 'PRO', 365);
    
    console.log('\n--- GENERATED KEYS ---');
    keys.forEach((k, i) => {
        console.log(`Key ${i + 1}: ${k.key}`);
    });
    console.log('----------------------\n');
    
    await prisma.$disconnect();
}

main().catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
});
