import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

export interface RequestStore {
    traceId: string;
    workspaceId?: string;
    userId?: string;
    sessionId?: string;
    messageId?: string;
    [key: string]: any;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

/**
 * Returns the current traceId from context or a generated one.
 */
export function getTraceId(): string {
    const store = requestContext.getStore();
    return store?.traceId || `tr-${crypto.randomBytes(4).toString('hex')}`;
}

/** Patch the current store without opening a new ALS run. Safe to call inside an active context. */
export function patchContext(patch: Partial<RequestStore>): void {
    const store = requestContext.getStore();
    if (store) Object.assign(store, patch);
}
