import { PrismaClient } from '@prisma/client';
import { extractProductData, ExtractionResult, calculateHybridConfidence } from '../modules/knowledge/knowledge.ai';
import { KnowledgeDataType, KnowledgeSourceStatus, ProductStatus } from '@prisma/client';
import { logger } from '../core/logger';
import { env } from '../env';

const prisma = new PrismaClient();
const log = logger.child({ module: 'test-phase5' });

// We simulate what knowledge.ingestion.ts does natively inline to capture "Before" and "After" easily
async function runAutoMergeSimulation(
    productId: string, 
    extraction: ExtractionResult, 
    matchTier: number,
    logPrefix: string
) {
    // Apply Hybrid Complete logic
    const finalHybridOutputs = calculateHybridConfidence(extraction, matchTier);

    // Initial Source DB
    const sourceData = await prisma.productKnowledgeSource.create({
        data: {
            productId: productId,
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            dataType: 'TEXT' as KnowledgeDataType,
            status: KnowledgeSourceStatus.CONFLICT 
        }
    });

    let finalSourceStatus: string = sourceData.status;

    const beforeProduct = await prisma.productKnowledge.findUnique({ where: { id: productId }});
    log.info({ [logPrefix]: 'BEFORE MERGE' }, JSON.stringify(beforeProduct, null, 2));

    const product = beforeProduct!;
    let hasMergedAny = false;
    let hasConflictAny = false;
    const existingSpecs = (product.specifications as Record<string, any>) || {};
    const newSpecs = { ...existingSpecs };

    // Evaluate Specifications
    if (finalHybridOutputs.specifications) {
        for (const [key, value] of Object.entries(finalHybridOutputs.specifications)) {
            const conf = finalHybridOutputs.fieldConfidence?.[key] || 0;
            if (conf >= 85) {
                if (existingSpecs[key] === undefined || existingSpecs[key] === null || String(existingSpecs[key]).trim() === '') {
                    newSpecs[key] = value;
                    hasMergedAny = true;
                    log.info({ key, value }, `[${logPrefix}] Merging NEW field!`);
                } else {
                    if (String(existingSpecs[key]).trim().toLowerCase() !== String(value).trim().toLowerCase()) {
                        hasConflictAny = true;
                        log.warn({ key, existing: existingSpecs[key], new: value }, `[${logPrefix}] CONFLICT detected!`);
                    } else {
                        log.info({ key }, `[${logPrefix}] NO-OP detected (values match perfectly).`);
                    }
                }
            } else {
                 log.warn({ key, conf }, `[${logPrefix}] Ignoring field due to low confidence (< 85)`);
            }
        }
    }

    finalSourceStatus = hasConflictAny ? 'CONFLICT' : (hasMergedAny ? 'APPLIED' : 'APPLIED');

    if (hasMergedAny) {
        await prisma.productKnowledge.update({
            where: { id: productId },
            data: {
                specifications: newSpecs as any,
                status: product.status === 'INCOMPLETE' ? ('PENDING_REVIEW' as ProductStatus) : product.status
            }
        });
    }

    await prisma.productKnowledgeSource.update({
        where: { id: sourceData.id },
        data: {
            extractedData: finalHybridOutputs.specifications as any,
            fieldConfidence: finalHybridOutputs.fieldConfidence as any,
            globalConfidence: finalHybridOutputs.globalConfidence,
            status: finalSourceStatus as KnowledgeSourceStatus
        }
    });

    const afterProduct = await prisma.productKnowledge.findUnique({ where: { id: productId }});
    const afterSource = await prisma.productKnowledgeSource.findUnique({ where: { id: sourceData.id }});

    log.info({ [logPrefix]: 'AFTER MERGE (Product)' }, JSON.stringify(afterProduct, null, 2));
    log.info({ [logPrefix]: 'AFTER MERGE (Source Status)' }, afterSource?.status);
}

async function main() {
    log.info('--- TESTING PHASE 5: AUTO-MERGE ENGINE ---');

    console.log(env.NODE_ENV); // ensure env loads

    const wsParams = { name: 'Phase 5 Test Workspace', settings: {} };
    const ws = await prisma.workspace.findFirst() || await prisma.workspace.create({ data: wsParams });

    // 1. Create a base product where some fields are empty and some exist
    const p1 = await prisma.productKnowledge.create({
        data: {
            workspaceId: ws.id,
            name: 'Phase 5 Industrial Drone',
            sku: 'DRONE-X1',
            status: 'INCOMPLETE',
            specifications: {
                "max_speed": "50 km/h", // Exists
                "color": "red"          // Exists
            }
        }
    });

    // TEST 1: EMPTY FIELD (MERGE) + NO-OP MATCH
    const mockExtractionA: ExtractionResult = {
        description: null,
        features: [],
        specifications: {
            "battery_life": "12 hours", // New field -> Should Merge
            "max_speed": "50 km/h"      // Same field -> Should NO-OP
        },
        fieldConfidence: {
            "battery_life": 100, // AI is highly confident
            "max_speed": 90
        },
        globalConfidence: 95
    };
    await runAutoMergeSimulation(p1.id, mockExtractionA, 1, 'TEST-A-SUCCESS');

    // TEST 2: CONFLICTING FIELD
    const mockExtractionB: ExtractionResult = {
        description: null,
        features: [],
        specifications: {
            "color": "blue", // Conflicting field!
            "weight": "2 kg" // New field
        },
        fieldConfidence: {
            "color": 99, 
            "weight": 95
        },
        globalConfidence: 97
    };
    await runAutoMergeSimulation(p1.id, mockExtractionB, 1, 'TEST-B-CONFLICT');

    // Clean up
    await prisma.productKnowledge.delete({ where: { id: p1.id } });
}

main().catch(console.error).finally(() => prisma.$disconnect());
