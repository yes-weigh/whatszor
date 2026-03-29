import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestStore {
    traceId: string;
    [key: string]: any;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

/**
 * Returns the current traceId from context or a generated one.
 */
export function getTraceId(): string {
    const store = requestContext.getStore();
    return store?.traceId || `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
