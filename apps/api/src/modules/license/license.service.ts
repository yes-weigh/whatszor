import crypto from 'crypto';
import { prisma } from '../../prisma/client';
import type { PlanTier } from '@prisma/client';

export async function generateLicenseKeys(
    generatedById: string,
    planTier: PlanTier,
    durationDays: number,
    count: number = 1
) {
    const keys = [];
    
    for (let i = 0; i < count; i++) {
        // Format: WZOR-PRO-XXXX-XXXX-XXXX
        const prefix = `WZOR-${planTier}`;
        const randomDocs = crypto.randomBytes(6).toString('hex').toUpperCase();
        const p1 = randomDocs.slice(0, 4);
        const p2 = randomDocs.slice(4, 8);
        const p3 = randomDocs.slice(8, 12);
        
        let finalKey = `${prefix}-${p1}-${p2}-${p3}`;
        
        // Ensure no out of bounds if bits are short which shouldn't happen with hex representation
        if(finalKey.length < 15) {
             finalKey = `${prefix}-${crypto.randomBytes(8).toString('hex').toUpperCase().match(/.{1,4}/g)?.slice(0, 3).join('-')}`;
        }

        keys.push({
            key: finalKey,
            planTier,
            durationDays,
            generatedById,
        });
    }

    await prisma.licenseKey.createMany({
        data: keys,
    });

    return keys;
}

export async function getLicenseKeys() {
    return prisma.licenseKey.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            workspace: {
                select: { name: true, slug: true }
            }
        }
    });
}

export async function redeemLicenseKey(workspaceId: string, keyString: string) {
    return prisma.$transaction(async (tx) => {
        const licenseKey = await tx.licenseKey.findUnique({
            where: { key: keyString }
        });

        if (!licenseKey) {
            throw new Error('Invalid license key');
        }

        if (licenseKey.status !== 'AVAILABLE') {
            throw new Error(`License key is already ${licenseKey.status.toLowerCase()}`);
        }

        // Calculate new expiry date based on current (if Active) or now (if suspended/trial)
        const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) throw new Error('Workspace not found');

        let newExpiry = new Date();
        if (workspace.status === 'ACTIVE' && workspace.expiresAt && workspace.expiresAt > new Date()) {
            newExpiry = new Date(workspace.expiresAt);
        }
        newExpiry.setDate(newExpiry.getDate() + licenseKey.durationDays);

        const updatedWorkspace = await tx.workspace.update({
            where: { id: workspaceId },
            data: {
                status: 'ACTIVE',
                planTier: licenseKey.planTier,
                expiresAt: newExpiry,
            }
        });

        const redeemedKey = await tx.licenseKey.update({
            where: { id: licenseKey.id },
            data: {
                status: 'REDEEMED',
                workspaceId,
                redeemedAt: new Date()
            }
        });

        return { workspace: updatedWorkspace, key: redeemedKey };
    });
}
