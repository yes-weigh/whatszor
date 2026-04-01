import { prisma } from '../../prisma/client';
import { ErrorCodes } from '@whatszor/shared';

export interface RenderContext {
    contact?: Record<string, any>;
    conversation?: Record<string, any>;
    workspace?: Record<string, any>;
    event?: Record<string, any>;
}

export interface RenderedTemplate {
    messageText: string;
    footerText: string | null;
    headerMediaId: string | null;
    headerMediaType: string | null;
    buttons: Array<{ type: string; label: string; payload?: string }>;
}

const ALLOWED_NAMESPACES = ['contact', 'conversation', 'workspace', 'event'];

/**
 * Validates that all {{variables}} within a string belong to allowed namespaces.
 * Throws an error if an unknown namespace is detected.
 */
export function validateMessageVariables(text: string): void {
    const rx = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = rx.exec(text)) !== null) {
        const fullPath = match[1].trim();
        const namespace = fullPath.split('.')[0];
        
        if (!ALLOWED_NAMESPACES.includes(namespace)) {
            throw {
                statusCode: 400,
                code: ErrorCodes.BAD_REQUEST,
                message: `Invalid variable namespace '${namespace}' in '${fullPath}'. Allowed: ${ALLOWED_NAMESPACES.join(', ')}`
            };
        }
    }
}

/**
 * Replaces {{variable.path}} in the template with actual values from the context.
 * Utilizes a simple dot-notation resolver.
 */
export function parseVariables(text: string, context: RenderContext): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const parts = path.trim().split('.');
        let current: any = context;
        
        for (const part of parts) {
            if (current === undefined || current === null) break;
            current = current[part];
        }

        return current !== undefined && current !== null ? String(current) : '';
    });
}

/**
 * Loads a specific TemplateVersion, injects the dynamic variables,
 * and resolves the media URL to produce the finalized layout.
 */
export async function renderTemplateVersion(
    templateVersionId: string, 
    context: RenderContext
): Promise<RenderedTemplate> {
    
    const version = await prisma.templateVersion.findUnique({
        where: { id: templateVersionId },
        include: {
            media: true,
            buttons: true
        }
    });

    if (!version) {
        throw new Error(`TemplateVersion ${templateVersionId} not found`);
    }

    // 1. Inject Variables
    const finalMessageText = parseVariables(version.messageText, context);
    
    // 2. Resolve Header Media
    let headerMediaId: string | null = null;
    let headerMediaType = null;
    
    if (version.media) {
        headerMediaId = version.media.id;
        headerMediaType = version.media.type;
    }

    // 3. Map buttons and Parse Variables in them
    const buttons = version.buttons.map(b => ({
        type: b.type,
        label: parseVariables(b.label, context),
        payload: b.payload ? parseVariables(b.payload, context) : undefined
    }));

    return {
        messageText: finalMessageText,
        footerText: version.footerText,
        headerMediaId,
        headerMediaType,
        buttons
    };
}
