import { prisma } from '../../prisma/client';
import { ErrorCodes, createError } from '@whatszor/shared';

// Ensures the contact exists within the workspace to prevent cross-tenant bleeding
async function assertContactAccess(workspaceId: string, contactId: string) {
    const contact = await prisma.contact.findFirst({
        where: { id: contactId, workspaceId, },
        select: { id: true },
    });
    if (!contact) {
        throw createError('Contact not found in this workspace', ErrorCodes.NOT_FOUND, 404);
    }
}

// Ensures the product exists within the workspace
async function assertProductAccess(workspaceId: string, productId: string) {
    const product = await prisma.productKnowledge.findFirst({
        where: { id: productId, workspaceId },
        select: { id: true },
    });
    if (!product) {
        throw createError('Product not found in this workspace', ErrorCodes.NOT_FOUND, 404);
    }
}

export async function addProductToContact(
    workspaceId: string,
    contactId: string,
    productId: string,
    relationType: string = 'INTERESTED',
    source: 'AI' | 'MANUAL' = 'MANUAL'
) {
    // 1. Strict Multi-Tenant Enforcement checks
    await assertContactAccess(workspaceId, contactId);
    await assertProductAccess(workspaceId, productId);

    // 2. Diff check to prevent dupe automation firings
    const existing = await prisma.contactProduct.findUnique({
        where: {
            workspaceId_contactId_productId_relationType: {
                workspaceId,
                contactId,
                productId,
                relationType
            }
        }
    });

    // 3. Validate/Upsert (using @@unique index on [workspaceId, contactId, productId, relationType] to block duplicate ties natively)
    try {
        const contactProduct = await prisma.contactProduct.upsert({
            where: {
                workspaceId_contactId_productId_relationType: {
                    workspaceId,
                    contactId,
                    productId,
                    relationType
                }
            },
            update: {}, // Already mapped, touch nothing (idempotent)
            create: {
                workspaceId,
                contactId,
                productId,
                relationType,
                source,
                ...(source === 'AI' ? { addedByAiAt: new Date() } : {})
            }
        });

        // 4. Trigger automation boundaries silently if newly acquired
        if (!existing) {
             const { getQueue, QueueName } = require('../../queues');
             await getQueue(QueueName.SYSTEM_EVENTS).add(
                 `event-PRODUCT_INTEREST-${contactProduct.id}`, 
                 {
                     eventType: 'PRODUCT_INTEREST',
                     workspaceId,
                     payload: { contactId, productId, relationType }
                 }
             );
        }

        return contactProduct;
    } catch (e: any) {
        throw createError('Failed to map product to contact', ErrorCodes.INTERNAL_ERROR, 500);
    }
}

export async function removeProductFromContact(workspaceId: string, contactId: string, productId: string, relationType: string) {
    await assertContactAccess(workspaceId, contactId);

    // Restrict deletion exclusively to the provided relationType to avoid devastating user flows
    await prisma.contactProduct.deleteMany({
        where: {
            workspaceId,
            contactId,
            productId,
            relationType
        }
    });

    return { success: true };
}

export async function listProductsForContact(
    workspaceId: string, 
    contactId: string,
    limit: number = 50,
    cursor?: string
) {
    await assertContactAccess(workspaceId, contactId);

    // Overfetch Block: Replace unshaped mapping with exact scoped definitions
    const records = await prisma.contactProduct.findMany({
        where: { workspaceId, contactId },
        take: limit,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { addedAt: 'desc' },
        select: {
            id: true,
            relationType: true,
            source: true,
            addedByAiAt: true,
            addedAt: true,
            product: {
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    price: true,
                    category: true,
                    status: true,
                }
            }
        }
    });

    // Grouping Strategy
    const grouped = new Map<string, any>();
    
    for (const row of records) {
        if (!grouped.has(row.product.id)) {
            grouped.set(row.product.id, {
                product: row.product,
                relationTypes: [row.relationType],
                latestAddedAt: row.addedAt,
                cursorId: row.id 
            });
        } else {
            const existing = grouped.get(row.product.id);
            if (!existing.relationTypes.includes(row.relationType)) {
                existing.relationTypes.push(row.relationType);
            }
        }
    }

    return {
        items: Array.from(grouped.values()),
        nextCursor: records.length === limit ? records[records.length - 1].id : null
    };
}
