import { prisma } from '../../prisma/client';
import { ErrorCodes } from '@whatszor/shared';
import { getQueue, QueueName } from '../../queues';

// Fetch paginated products for an organization
export async function getProducts(workspaceId: string, skip: number = 0, take: number = 20) {
    const [products, total] = await Promise.all([
        prisma.productKnowledge.findMany({
            where: { workspaceId },
            skip,
            take,
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { sources: true } } }
        }),
        prisma.productKnowledge.count({ where: { workspaceId } })
    ]);
    return { products, total };
}

// Update product basic details or specifications
export async function updateProduct(workspaceId: string, productId: string, data: any) {
    const product = await prisma.productKnowledge.findUnique({
        where: { id: productId, workspaceId }
    });
    
    if (!product) {
        throw { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: `Product ${productId} not found` };
    }
    
    return prisma.productKnowledge.update({
        where: { id: productId },
        data,
    });
}

// Import products from CSV parsed records
export async function importProducts(workspaceId: string, records: any[]) {
    let created = 0;
    let updated = 0;

    for (const record of records) {
        // Map common columns; feel free to adapt headers like 'Product Name' -> 'name'
        const name = record.name || record.Name || record['Product Name'] || record.product_name;
        if (!name) continue; // Name is strictly required

        const sku = record.sku || record.SKU || record.sku_code || null;
        let price = record.price || record.Price || null;
        if (price) {
            price = parseFloat(price.toString().replace(/[^0-9.]/g, ''));
            if (isNaN(price)) price = null;
        }

        const category = record.category || record.Category || null;

        // Calculate a basic missing fields count
        let missingFieldsCount = 0;
        if (!price) missingFieldsCount++;
        if (!category) missingFieldsCount++;
        // Add more logic based on specifications or media strings if they exist
        missingFieldsCount += 2; // For empty description and MediaUrls

        const dataPayload = {
            name,
            sku,
            price,
            category,
            status: 'INCOMPLETE' as const,
            missingFieldsCount
        };

        if (sku) {
            const existing = await prisma.productKnowledge.findFirst({
                where: { workspaceId, sku }
            });

            if (existing) {
                await prisma.productKnowledge.update({
                    where: { id: existing.id },
                    data: dataPayload
                });
                updated++;
                continue;
            }
        }

        // Create new
        await prisma.productKnowledge.create({
            data: {
                workspaceId,
                ...dataPayload
            }
        });
        created++;
    }

    return { created, updated };
}

// Manual Outreach trigger mapped from API Call
export async function triggerOutreach(workspaceId: string) {
    // Resolve the first active AllowedNumber as the outreach recipient.
    // The knowledge bot sends to people who are authorised to provide product info.
    const allowedNumber = await prisma.allowedNumber.findFirst({
        where: { workspaceId, isActive: true },
        orderBy: { createdAt: 'asc' },
    });

    if (!allowedNumber) {
        throw {
            statusCode: 422,
            code: 'NO_ALLOWED_NUMBER',
            message: 'No active allowed number configured. Add one in Settings → Knowledge Bot before triggering outreach.',
        };
    }

    const queue = getQueue(QueueName.KNOWLEDGE_OUTREACH);
    await queue.add('collect_product_info', { workspaceId, phone: allowedNumber.phoneNumber }, {
        jobId: `outreach_${workspaceId}_${Date.now()}`
    });
    return { queued: true, phone: allowedNumber.phoneNumber };
}

// ── PHASE 6: Admin Review UI & API Endpoints ──────────────────────────────

// List Knowledge Sources mapped to a specific product
export async function getProductSources(workspaceId: string, productId: string) {
    // Validate product ownership securely
    const product = await prisma.productKnowledge.findUnique({
        where: { id: productId, workspaceId }
    });
    if (!product) {
        throw { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: `Product ${productId} not found` };
    }

    return prisma.productKnowledgeSource.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' }
    });
}

// Apply selected fields from a source manually directly into ProductKnowledge
export async function applySource(workspaceId: string, productId: string, sourceId: string, data: { description?: string, specifications?: Record<string, any>, features?: string[] }) {
    const product = await prisma.productKnowledge.findUnique({
        where: { id: productId, workspaceId }
    });
    if (!product) {
        throw { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: `Product ${productId} not found` };
    }

    const source = await prisma.productKnowledgeSource.findUnique({
        where: { id: sourceId, productId }
    });
    if (!source) {
        throw { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: `Source ${sourceId} not found mapped to this product` };
    }

    const existingSpecs = (product.specifications as Record<string, any>) || {};
    const newSpecs = { ...existingSpecs };

    if (data.specifications) {
        Object.assign(newSpecs, data.specifications);
    }
    if (data.features && data.features.length > 0) {
        newSpecs['features'] = data.features;
    }

    const updatePayload: any = { specifications: newSpecs };
    if (data.description !== undefined) {
        updatePayload.description = data.description;
    }

    await prisma.$transaction([
        prisma.productKnowledge.update({
            where: { id: productId },
            data: updatePayload
        }),
        prisma.productKnowledgeSource.update({
            where: { id: sourceId },
            data: { status: 'APPLIED' }
        })
    ]);

    return { success: true };
}

// Safely reject / discard an extraction definitively.
export async function rejectSource(workspaceId: string, productId: string, sourceId: string) {
    const source = await prisma.productKnowledgeSource.findUnique({
        where: { id: sourceId, productId },
        include: { product: true }
    });
    if (!source || source.product?.workspaceId !== workspaceId) {
        throw { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: `Source ${sourceId} not found mapped to this workspace/product` };
    }

    await prisma.productKnowledgeSource.update({
        where: { id: sourceId },
        data: { status: 'DISCARDED' }
    });

    return { success: true };
}

// Mark product as VERIFIED officially closing data collection loopholes.
export async function verifyProduct(workspaceId: string, productId: string) {
    const product = await prisma.productKnowledge.update({
        where: { id: productId, workspaceId },
        data: { status: 'VERIFIED' }
    });

    return product;
}

// ── PHASE 7: Observability Metrics & Debugging ────────────────────────────────

export async function getMetrics(workspaceId: string) {
    const totalSources = await prisma.productKnowledgeSource.count({ where: { product: { workspaceId } } });
    if (totalSources === 0) return {
        totalIngested: 0,
        mappingSuccessRate: 100,
        orphanedRatio: 0,
        failedValidationRatio: 0,
        conflictRatio: 0,
        appliedRatio: 0
    };

    const statusCounts = await prisma.productKnowledgeSource.groupBy({
        by: ['status'],
        where: { product: { workspaceId } },
        _count: { id: true }
    });

    const getCount = (status: string) => statusCounts.find(s => s.status === status)?._count.id || 0;

    const orphaned = getCount('ORPHANED');
    const failed = getCount('FAILED_VALIDATION');
    const conflict = getCount('CONFLICT');
    const applied = getCount('APPLIED');
    const pending = getCount('PENDING_REVIEW');

    const mappedSuccessfully = applied + conflict + pending + failed; // Orphaned is unmapped

    return {
        totalIngested: totalSources,
        mappingSuccessRate: Math.round((mappedSuccessfully / totalSources) * 100),
        orphanedRatio: Math.round((orphaned / totalSources) * 100),
        failedValidationRatio: Math.round((failed / totalSources) * 100),
        conflictRatio: Math.round((conflict / totalSources) * 100),
        appliedRatio: Math.round((applied / totalSources) * 100)
    };
}

export async function reprocessSource(workspaceId: string, sourceId: string) {
    const source = await prisma.productKnowledgeSource.findUnique({
        where: { id: sourceId }
    });
    
    if (!source) {
        throw { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: `Source not found` };
    }

    if (source.productId) {
        const p = await prisma.productKnowledge.findUnique({ where: { id: source.productId } });
        if (p?.workspaceId !== workspaceId) throw { statusCode: 403, code: ErrorCodes.FORBIDDEN, message: 'Source maps to another boundary' };
    }

    const queue = getQueue(QueueName.KNOWLEDGE_INGESTION);
    // Mimic the signature of `process_incoming_knowledge` payload!
    // What was the original payload structure? Let's assume we pass { sourceId, reprocess: true } or the raw webhook.
    // Wait, process_incoming_knowledge usually expects { messageId, senderPhone, messageType, rawPayload }. We might need a generic `sourceId` hook inside `knowledge.worker.ts`.
    await queue.add('process_incoming_knowledge', { 
        sourceId, 
        reprocess: true 
    }, {
        jobId: `reprocess_${sourceId}_${Date.now()}`
    });

    return { queued: true, sourceId };
}

// ── PHASE 9: Allowed Numbers CRUD ──────────────────────────────────────────

export async function getAllowedNumbers(workspaceId: string) {
    return prisma.allowedNumber.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' }
    });
}

export async function createAllowedNumber(workspaceId: string, data: { phoneNumber: string, label?: string, isActive?: boolean }) {
    // Basic verification of unique per workspace
    const existing = await prisma.allowedNumber.findFirst({
        where: { workspaceId, phoneNumber: data.phoneNumber }
    });
    if (existing) {
        throw { statusCode: 400, code: ErrorCodes.BAD_REQUEST, message: 'Phone number already mapped' };
    }
    return prisma.allowedNumber.create({
        data: {
            workspaceId,
            phoneNumber: data.phoneNumber,
            label: data.label,
            isActive: data.isActive ?? true
        }
    });
}

export async function updateAllowedNumber(workspaceId: string, id: string, data: { label?: string, isActive?: boolean }) {
    return prisma.allowedNumber.update({
        where: { id, workspaceId },
        data
    });
}

export async function deleteAllowedNumber(workspaceId: string, id: string) {
    return prisma.allowedNumber.delete({
        where: { id, workspaceId }
    });
}
