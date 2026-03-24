import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { env } from '../../env';
import { logger } from '../../core/logger';
import { promises as fs } from 'fs';
import { KnowledgeDataType } from '@prisma/client';

const log = logger.child({ module: 'knowledge.ai' });
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const MODELS = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];

export const ExtractionSchema = z.object({
    description: z.string().nullable().optional(),
    specifications: z.record(z.string(), z.union([z.string(), z.number()])).optional().default({}),
    features: z.array(z.string()).optional().default([]),
    fieldConfidence: z.record(z.string(), z.number()).optional().default({}),
    globalConfidence: z.number().optional().default(0)
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;

const SYSTEM_PROMPT = `You are a Data Extraction Engine for a CRM Product Knowledge Base.
Your job is to extract exact product specifications, descriptions, and features from raw inputs (text, images, audio transcripts, PDFs).

Return ONLY valid JSON matching this schema:
{
  "description": string | null,
  "specifications": { "key": "value" }, // Key-value pairs for precise stats
  "features": [ "string" ], // Array of selling points or attributes
  "fieldConfidence": { "key": number }, // Confidence score (0-100) for each extracted key
  "globalConfidence": number // Overall confidence (0-100)
}

RULES:
- NO hallucination. If unsure, omit the field.
- If input is irrelevant to a product, return empty values and low confidence.
- Respond ONLY with JSON. No markdown backticks.`;

export async function extractProductData(
    rawText: string | null,
    localMediaPath: string | null,
    mimeType: string | null,
    _dataType: KnowledgeDataType
): Promise<ExtractionResult | null> {
    
    const parts: any[] = [];
    
    if (rawText) {
        parts.push({ text: `Raw Text Input:\n${rawText}` });
    } else {
        parts.push({ text: `Extract the product data from the provided media.` });
    }

    if (localMediaPath && mimeType) {
        try {
            const buffer = await fs.readFile(localMediaPath);
            parts.push({
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType
                }
            });
        } catch (err) {
            log.error({ err, localMediaPath }, 'Failed to load media for AI extraction');
        }
    }

    let finalValidatedResult: ExtractionResult | null = null;
    let fallbackError: any = null;

    for (const currentModel of MODELS) {
        try {
            let attempt = 0;
            let lastErrorText = '';
            let validationSuccess = false;
            
            while (attempt < 2) {
                const currentParts = [...parts];
                if (attempt === 1) {
                    currentParts.push({ text: `\nCORRECTION: The last JSON you provided failed validation. Ensure your output strictly adheres to the requested JSON schema. Error: ${lastErrorText}` });
                }

                const response = await ai.models.generateContent({
                    model: currentModel,
                    contents: [{ role: 'user', parts: currentParts }],
                    config: {
                        systemInstruction: SYSTEM_PROMPT,
                        temperature: 0.1,
                        responseMimeType: 'application/json',
                    }
                });

                const rawJson = (response.text || '{}').trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
                
                try {
                    const parsed = JSON.parse(rawJson);
                    const validated = ExtractionSchema.parse(parsed);
                    finalValidatedResult = validated;
                    validationSuccess = true;
                    break;
                } catch (validationErr: any) {
                    log.warn({ model: currentModel, attempt, error: validationErr.message }, 'Extraction schema validation failed');
                    lastErrorText = validationErr.message;
                    attempt++;
                }
            }
            
            if (validationSuccess) {
                log.info({ model: currentModel }, 'Gemini API extraction successful');
                return finalValidatedResult; 
            } else {
                log.warn({ model: currentModel }, 'AI model failed validation twice. Trying fallback model...');
            }

        } catch (apiError: any) {
             const statusCode = apiError?.status || apiError?.response?.status;
             log.warn({ model: currentModel, error: apiError.message, statusCode }, 'Gemini API call failed for this model. Falling back...');
             fallbackError = apiError;
        }
    }

    log.error({ error: fallbackError?.message }, 'ALL Gemini models failed or exhausted. Returning null for FAILED_VALIDATION.');
    return null;
}

export function calculateHybridConfidence(
    extraction: ExtractionResult,
    matchTier: number // 1, 2, 3, or 4 (fallback)
): ExtractionResult {
    const ctxBonus = matchTier === 1 ? 100 : (matchTier === 2 || matchTier === 3 ? 50 : 0);
    
    const finalFieldConfidence: Record<string, number> = {};
    let totalScore = 0;
    let count = 0;

    const allKeys = Object.keys(extraction.fieldConfidence || {});
    
    for (const key of allKeys) {
        let aiScore = extraction.fieldConfidence![key] || 0;
        
        let completenessBonus = 0;
        let val: any = extraction.specifications?.[key];
        if (key === 'description') val = extraction.description;
        if (key === 'features' && extraction.features && extraction.features.length > 0) val = extraction.features.join(' ');
        
        if (val !== undefined && val !== null) {
             const strVal = String(val);
             if (strVal.trim().length > 0) {
                 if (/\d+/.test(strVal) && /[a-zA-Z]+/.test(strVal)) {
                     completenessBonus = 100; // Has number + unit
                 } else {
                     completenessBonus = 50;  // Valid string
                 }
             }
        }
        
        const rawFinal = (0.6 * aiScore) + (0.2 * completenessBonus) + (0.2 * ctxBonus);
        const finalScore = Math.min(100, Math.max(0, Math.round(rawFinal)));
        
        finalFieldConfidence[key] = finalScore;
        totalScore += finalScore;
        count++;
    }
    
    const globalConfidence = count > 0 ? Math.round(totalScore / count) : 0;
    
    return {
        ...extraction,
        fieldConfidence: finalFieldConfidence,
        globalConfidence
    };
}
