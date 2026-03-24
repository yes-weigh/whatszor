import { Job } from 'bullmq';
import { prisma } from '../../prisma/client';
import { KnowledgeDataType, KnowledgeSourceStatus, Prisma } from '@prisma/client';
import { logger } from '../../core/logger';
import { getRedisClient } from '../../core/redis';
import { downloadMediaMessage } from '@itsukichan/baileys';
import { saveMedia } from '../../core/media-storage';
import { extractProductData, calculateHybridConfidence } from './knowledge.ai';

const log = logger.child({ module: 'knowledge-ingestion' });

/**
 * processIncomingKnowledgeJob
 *
 * BullMQ Worker handling messages sent explicitly to the Internal Knowledge Bot.
 * Responsible for media/text extraction, 4-tier context mapping, and storing raw ProductKnowledgeSource rows.
 */
export async function processIncomingKnowledgeJob(job: Job) {
    const { workspaceId, sessionId, messageId, senderPhone, payload } = job.data;
    const redis = getRedisClient();

    try {
        if (job.data.reprocess && job.data.sourceId) {
            log.info({ sourceId: job.data.sourceId }, 'Processing REPROCESS inbound job');
            const source = await prisma.productKnowledgeSource.findUnique({ where: { id: job.data.sourceId }});
            if (!source) return;
            return await executeAIAndMerge(source, 4); 
        }

        log.info({ messageId, senderPhone }, 'Processing incoming knowledge bot ingestion');

        // Ensure idempotency (we bound the jobId to messageId)
        const existingSource = await prisma.productKnowledgeSource.findFirst({
            where: { messageId }
        });
        if (existingSource) {
            log.info({ messageId }, 'Idempotency caught: Source already exists for this messageId');
            return; // Already processed
        }

        const msgMessage = payload.message;
        const msgKey = payload.key;

        // ── 1. Extract Text & Quoted Meta ──────────────────────────────────
        let rawText: string | null = null;
        let quotedMsgId: string | null = null;
        
        // Find text content
        rawText = msgMessage?.conversation
            || msgMessage?.extendedTextMessage?.text
            || msgMessage?.imageMessage?.caption
            || msgMessage?.videoMessage?.caption
            || msgMessage?.documentMessage?.caption
            || null;

        // Find context/stanza fallback
        const contextInfo = msgMessage?.extendedTextMessage?.contextInfo 
            || msgMessage?.imageMessage?.contextInfo
            || msgMessage?.videoMessage?.contextInfo
            || msgMessage?.audioMessage?.contextInfo
            || msgMessage?.documentMessage?.contextInfo;

        quotedMsgId = contextInfo?.stanzaId || null;

        // ── 2. Determine DataType & Extract Media ──────────────────────────
        let dataType: KnowledgeDataType = KnowledgeDataType.TEXT;
        let rawContentUrl: string | undefined = undefined;
        let mimeTypeToUse: string | null = null;

        const mediaSpecific = msgMessage?.imageMessage 
            || msgMessage?.videoMessage 
            || msgMessage?.audioMessage 
            || msgMessage?.documentMessage;

        let hasDownloadableMedia = false;
        if (msgMessage?.imageMessage) { dataType = KnowledgeDataType.IMAGE; hasDownloadableMedia = true; }
        else if (msgMessage?.videoMessage) { dataType = ('VIDEO' as any); hasDownloadableMedia = true; }
        else if (msgMessage?.audioMessage) { dataType = KnowledgeDataType.AUDIO; hasDownloadableMedia = true; }
        else if (msgMessage?.documentMessage) { dataType = KnowledgeDataType.PDF; hasDownloadableMedia = true; }

        if (hasDownloadableMedia && mediaSpecific?.url && mediaSpecific?.mediaKey) {
            try {
                mimeTypeToUse = mediaSpecific.mimetype || 'application/octet-stream';
                const buffer = await downloadMediaMessage(
                    payload,
                    'buffer',
                    {},
                ) as Buffer;

                const savedUrl = await saveMedia(buffer, {
                    workspaceId,
                    messageId: msgKey.id,
                    mimeType: mimeTypeToUse as string,
                });
                
                rawContentUrl = savedUrl.localPath; // local path serves as URL for now since S3 abstraction saves local or remote
                log.info({ messageId: msgKey.id, rawContentUrl }, 'Properly downloaded and safely stowed raw media content');
            } catch (err) {
                log.warn({ err, messageId: msgKey.id }, 'Failed to download inbound knowledge media buffer');
            }
        }

        // ── 3. Four-Tier Context Resolution (CRITICAL) ─────────────────────
        let resolvedProductId: string | null = null;

        // Tier 1: Quoted message lookup
        if (quotedMsgId) {
            const redisVal = await redis.get(`bot:msg:${quotedMsgId}`);
            if (redisVal) {
                resolvedProductId = redisVal;
                log.info({ messageId, resolvedProductId, tier: 1 }, 'Resolved product via Tier 1: Quoted Message ID');
            }
        }

        // Tier 2: Token regex match inside the user's reply string
        if (!resolvedProductId && rawText) {
            const tokenMatch = rawText.match(/#PRD-([A-Za-z0-9_-]+)/);
            if (tokenMatch && tokenMatch[1]) {
                // Determine if this SKU / token exists exactly in DB
                const prdId = tokenMatch[1];
                const matchingProduct = await prisma.productKnowledge.findFirst({
                    where: { workspaceId, id: prdId }
                });
                
                if (matchingProduct) {
                    resolvedProductId = matchingProduct.id;
                    log.info({ messageId, resolvedProductId, tier: 2 }, 'Resolved product via Tier 2: Regex Token Match');
                }
            } // (Optional: could match SKU natively if needed, but instructed to match exact #PRD-xxxx regex token)
        }

        // Tier 3: Session memory map bound to sender
        if (!resolvedProductId) {
            const sessionVal = await redis.get(`bot:session:${senderPhone}`);
            if (sessionVal) {
                resolvedProductId = sessionVal;
                log.info({ messageId, resolvedProductId, tier: 3 }, 'Resolved product via Tier 3: Redis Active User Session Track');
            }
        }

        // Tier 4: Fallback
        let status: KnowledgeSourceStatus = resolvedProductId ? KnowledgeSourceStatus.CONFLICT : KnowledgeSourceStatus.ORPHANED;
        let matchTier = 4;
        if (resolvedProductId && quotedMsgId) matchTier = 1;
        else if (resolvedProductId && rawText?.match(/#PRD-/)) matchTier = 2;
        else if (resolvedProductId) matchTier = 3;

        if (!resolvedProductId) {
            log.warn({ messageId, senderPhone }, 'Context resolution failed, marking source as ORPHANED payload fallback');
            
            // Re-route fallback message back through safe socket to request elaboration from user 
            // NOTE: In an architectural design we'd pull the safeSocket, relying purely on the BullMQ outbound worker:
            import('../../queues').then(({ getQueue, QueueName }) => {
                getQueue(QueueName.WHATSAPP).add(`orphan-fallback-${messageId}`, {
                    workspaceId,
                    sessionId,
                    messageId: `botfb_${Date.now()}`,
                    toJid: msgKey.remoteJid,
                    type: 'TEXT',
                    content: `Hi! I received your message but I'm not sure which product product this belongs to. Could you please reply directly to one of my earlier product questions?`,
                });
            }).catch(err => log.error({ err }, 'Failed enqueueing orphan fallback'));
        }

        // ── 4. Database Write (Pre-AI initial state) ────────────────────────
        const sourceData = await prisma.productKnowledgeSource.create({
            data: {
                productId: resolvedProductId || undefined,
                messageId: messageId,
                dataType: dataType as KnowledgeDataType,
                rawContentUrl: rawContentUrl || undefined,
                rawText: rawText || undefined,
                status: status
            }
        });

        log.info({ sourceId: sourceData.id, resolvedProductId, status }, 'Successfully mapped & persisted the incoming content payload');

        // ── 5. AI Extraction Pipeline & Merge Engine ────────────────────────
        await executeAIAndMerge(sourceData, matchTier, workspaceId, sessionId, messageId, msgKey?.remoteJid);

    } catch (error) {
        log.error({ err: error, messageId }, 'Fatal exception executing knowledge ingestion worker mapping');
        throw error;
    }
}

async function executeAIAndMerge(sourceData: any, matchTier: number, workspaceId?: string, sessionId?: string, messageId?: string, toJid?: string) {
    const extraction = await extractProductData(sourceData.rawText || null, sourceData.rawContentUrl || null, null, sourceData.dataType);
    
    if (!extraction) {
        // Validation completely failed
        await prisma.productKnowledgeSource.update({
            where: { id: sourceData.id },
            data: { status: 'FAILED_VALIDATION' }
        });
        log.warn({ sourceId: sourceData.id }, 'Marked Phase 4 Extraction FAILED_VALIDATION due to hard gemini constraints');
        
        // Enhance Bot UX: Add retry prompts
        if (workspaceId && sessionId && toJid && messageId) {
            import('../../queues').then(({ getQueue, QueueName }) => {
                getQueue(QueueName.WHATSAPP).add(`failed-fallback-${messageId}`, {
                    workspaceId,
                    sessionId,
                    messageId: `botfb_${Date.now()}`,
                    toJid,
                    type: 'TEXT',
                    content: `I'm sorry, I couldn't extract product information from that format. Could you please provide it again with clearer labels (like *Description:* ... *Specs:* ...) or upload clearer photos?`,
                });
            }).catch(err => log.error({ err }, 'Failed enqueueing failed validation fallback'));
        }
        return;
    }

    const finalHybridOutputs = calculateHybridConfidence(extraction, matchTier);
    let finalSourceStatus: KnowledgeSourceStatus = sourceData.status as KnowledgeSourceStatus;

    // Always attempt merge if resolved and not permanently locked
    if (sourceData.productId && finalSourceStatus !== 'ORPHANED' && finalSourceStatus !== 'FAILED_VALIDATION') {
        const product = await prisma.productKnowledge.findUnique({
            where: { id: sourceData.productId }
        });

        if (product) {
            let hasMergedAny = false;
            let hasConflictAny = false;
            const existingSpecs = (product.specifications as Record<string, any>) || {};
            const newSpecs = { ...existingSpecs };

            if (finalHybridOutputs.specifications) {
                for (const [key, value] of Object.entries(finalHybridOutputs.specifications)) {
                    const conf = finalHybridOutputs.fieldConfidence?.[key] || 0;
                    if (conf >= 85) {
                        if (existingSpecs[key] === undefined || existingSpecs[key] === null || String(existingSpecs[key]).trim() === '') {
                            newSpecs[key] = value;
                            hasMergedAny = true;
                        } else {
                            if (String(existingSpecs[key]).trim().toLowerCase() !== String(value).trim().toLowerCase()) {
                                hasConflictAny = true;
                            }
                        }
                    }
                }
            }

            let newDescription = product.description;
            if (finalHybridOutputs.description) {
               const conf = finalHybridOutputs.fieldConfidence?.['description'] || 0;
               if (conf >= 85) {
                   if (!newDescription || String(newDescription).trim() === '') {
                       newDescription = finalHybridOutputs.description;
                       hasMergedAny = true;
                   } else if (String(newDescription).trim().toLowerCase() !== String(finalHybridOutputs.description).trim().toLowerCase()) {
                       hasConflictAny = true;
                   }
               }
            }

            let newFeatures: string[] = Array.isArray(existingSpecs['features']) ? [...existingSpecs['features']] : [];
            if (finalHybridOutputs.features && Array.isArray(finalHybridOutputs.features) && finalHybridOutputs.features.length > 0) {
               const conf = finalHybridOutputs.fieldConfidence?.['features'] || 0;
               if (conf >= 85) {
                   if (newFeatures.length === 0) {
                       newSpecs['features'] = [...finalHybridOutputs.features];
                       hasMergedAny = true;
                   } else {
                       const featuresMatch = 
                           newFeatures.length === finalHybridOutputs.features.length &&
                           newFeatures.every((val, index) => val === finalHybridOutputs.features![index]);
                       
                       if (!featuresMatch) {
                           hasConflictAny = true;
                       }
                   }
               }
            }
            
            finalSourceStatus = (hasConflictAny ? 'CONFLICT' : (hasMergedAny ? 'APPLIED' : 'CONFLICT')) as KnowledgeSourceStatus;

            if (hasMergedAny) {
                await prisma.productKnowledge.update({
                    where: { id: sourceData.productId },
                    data: {
                        description: newDescription,
                        specifications: newSpecs as Prisma.JsonObject,
                        status: product.status === 'INCOMPLETE' ? 'PENDING_REVIEW' : product.status
                    }
                });
                log.info({ productId: sourceData.productId, hasConflictAny }, 'Auto-Merge Engine successfully applied payload to core product data');
            }
        }
    }

    await prisma.productKnowledgeSource.update({
        where: { id: sourceData.id },
        data: {
            extractedData: {
                description: finalHybridOutputs.description,
                specifications: finalHybridOutputs.specifications,
                features: finalHybridOutputs.features
            } as Prisma.JsonObject,
            fieldConfidence: finalHybridOutputs.fieldConfidence as Prisma.JsonObject,
            globalConfidence: finalHybridOutputs.globalConfidence,
            status: finalSourceStatus as KnowledgeSourceStatus
        }
    });

    log.info({ 
        sourceId: sourceData.id, 
        finalSourceStatus,
        globalConfidence: finalHybridOutputs.globalConfidence 
    }, 'Phase 5 AI Extractions finalized merging engine evaluations.');
}
