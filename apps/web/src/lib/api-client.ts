/**
 * @file api-client.ts
 * @description Typed API wrapper that enforces the contract invariant:
 *   After the Axios interceptor, `res.data` IS the payload (type T).
 *   Callers MUST NOT access `.data` again on the returned value.
 *
 * Invariant:
 *   Backend sends:  HTTP 200 { success: true, data: T }
 *   Interceptor returns: AxiosResponse where .data = T
 *   apiClient.get<T>() returns: Promise<T>        ← no further .data access
 *
 * Usage:
 *   const contacts = await apiClient.get<Contact[]>('/crm/contacts');
 *   const { campaigns, total } = await apiClient.get<CampaignList>('/campaigns');
 */

import api from './api';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

function makeMethod<T>(method: HttpMethod) {
    return (url: string, data?: unknown, config?: Record<string, unknown>): Promise<T> => {
        const call =
            method === 'get' || method === 'delete'
                ? (api[method] as (u: string, c?: unknown) => Promise<unknown>)(url, config)
                : (api[method] as (u: string, d?: unknown, c?: unknown) => Promise<unknown>)(url, data, config);
        return (call as Promise<{ data: T }>).then((res) => res.data);
    };
}

export const apiClient = {
    /** Fetch a resource. Returns the unwrapped payload T directly. */
    get: makeMethod<never>('get') as <T>(url: string, config?: Record<string, unknown>) => Promise<T>,

    /** POST a resource. Returns the unwrapped payload T directly. */
    post: makeMethod<never>('post') as <T>(url: string, data?: unknown, config?: Record<string, unknown>) => Promise<T>,

    /** PUT a resource. Returns the unwrapped payload T directly. */
    put: makeMethod<never>('put') as <T>(url: string, data?: unknown, config?: Record<string, unknown>) => Promise<T>,

    /** PATCH a resource. Returns the unwrapped payload T directly. */
    patch: makeMethod<never>('patch') as <T>(url: string, data?: unknown, config?: Record<string, unknown>) => Promise<T>,

    /** DELETE a resource. Returns the unwrapped payload T directly. */
    delete: makeMethod<never>('delete') as <T>(url: string, config?: Record<string, unknown>) => Promise<T>,
} as const;

export default apiClient;
