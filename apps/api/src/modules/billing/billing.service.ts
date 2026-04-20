import { prisma } from '../../prisma/client';
import { PlanTier } from '@prisma/client';
import { ErrorCodes } from '@whatszor/shared';
import { invalidateWorkspaceCache } from '../../middleware/requireActiveWorkspace';

export async function createPaymentRequest(workspaceId: string, transactionRef: string, planTier: PlanTier, durationDays: number = 30, amountPaid: string = '0') {
    if (!transactionRef) throw new Error('Transaction reference (UTR) is required');
    if (!Object.values(PlanTier).includes(planTier)) throw new Error('Invalid plan tier');

    // Duplicate UTR guard — prevent the same reference from being submitted multiple times
    const existing = await prisma.paymentRequest.findFirst({
        where: {
            transactionRef,
            status: { in: ['PENDING', 'APPROVED'] }
        }
    });
    if (existing) {
        throw Object.assign(
            new Error('This UTR number has already been submitted. Please check your payment history.'),
            { statusCode: 400, code: ErrorCodes.BAD_REQUEST }
        );
    }

    const payment = await prisma.paymentRequest.create({
        data: {
            workspaceId,
            transactionRef,
            amountPaid,
            planTier,
            durationDays,
            status: 'PENDING'
        }
    });

    return payment;
}

export async function getUserPaymentRequests(workspaceId: string) {
    return prisma.paymentRequest.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin logic

export async function getAdminPaymentRequests() {
    return prisma.paymentRequest.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            workspace: { select: { id: true, name: true, planTier: true } }
        }
    });
}

export async function processPaymentRequest(paymentId: string, action: 'APPROVE' | 'REJECT', adminId: string, adminNote?: string) {
    const payment = await prisma.paymentRequest.findUnique({
        where: { id: paymentId }
    });

    if (!payment) {
        throw Object.assign(new Error('Payment request not found'), { statusCode: 404, code: ErrorCodes.NOT_FOUND });
    }

    if (payment.status !== 'PENDING') {
        throw Object.assign(new Error(`Payment is already ${payment.status}`), { statusCode: 400, code: ErrorCodes.BAD_REQUEST });
    }

    if (action === 'REJECT') {
        return prisma.paymentRequest.update({
            where: { id: paymentId },
            data: { status: 'REJECTED', adminNote: adminNote?.trim() || null }
        });
    }

    // APPROVE flow
    // 1. Mark as APPROVED
    // 2. Generate license key
    // 3. Redeem license key for workspace
    const durationDays = payment.durationDays;

    const updatedPayment = await prisma.$transaction(async (tx) => {
        // Mark payment
        const updated = await tx.paymentRequest.update({
            where: { id: paymentId },
            data: { status: 'APPROVED' }
        });

        // Auto-generate and redeem key
        const keyData = await tx.licenseKey.create({
            data: {
                key: `LK-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
                planTier: payment.planTier,
                durationDays: durationDays,
                status: 'REDEEMED',
                generatedById: adminId,
                workspaceId: payment.workspaceId,
                redeemedAt: new Date(),
            }
        });

        // Redeem key for workspace
        const workspace = await tx.workspace.findUnique({ where: { id: payment.workspaceId } });
        
        let newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + keyData.durationDays);

        if (workspace?.expiresAt && workspace.expiresAt > new Date()) {
            // Stack the days if existing key is still valid
            newExpiry = new Date(workspace.expiresAt.getTime());
            newExpiry.setDate(newExpiry.getDate() + keyData.durationDays);
        }

        await tx.workspace.update({
            where: { id: payment.workspaceId },
            data: {
                planTier: keyData.planTier,
                expiresAt: newExpiry,
                // Also reset current month broadcast usage immediately upon upgrade
                broadcastUsageCurrentMonth: 0, 
                broadcastUsageMonth: new Date().toISOString().substring(0, 7)
            }
        });

        return updated;
    });

    // Purge stale cache so requireActiveWorkspace picks up the new planTier/expiresAt immediately
    invalidateWorkspaceCache(payment.workspaceId);

    return updatedPayment;
}
