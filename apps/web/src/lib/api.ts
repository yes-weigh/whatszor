import axios from 'axios';
import { useAuthStore } from '../store/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// Attach token from localStorage on every request
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('accessToken');
        if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Keep track of refresh requests to prevent infinite loops
let isRefreshing = false;
let failedQueue: Array<{ resolve: (val?: unknown) => void; reject: (err?: unknown) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });

    failedQueue = [];
};

// ─── Response Contract Invariant ────────────────────────────────────────────
// Backend sends:   { success: true, data: T }  OR  { success: false, error: E }
// After this interceptor: res.data === T  (the payload, NOT the wrapper)
// THEREFORE: Any code doing `res.data.data` is a double-unwrap bug.
// ─────────────────────────────────────────────────────────────────────────────
api.interceptors.response.use(
    (res) => {
        // If the response matches our standard wrapper, unwrap the data field.
        if (res.data && typeof res.data === 'object' && res.data.success === true && 'data' in res.data) {
            // eslint-disable-next-line no-restricted-syntax
            res.data = res.data.data;
        }

        // DEV-ONLY: Detect endpoints that are double-wrapping (still nesting { data: ... })
        // after the interceptor unwrapped. This means the endpoint called sendSuccess({ data: X })
        // instead of sendSuccess(X). Treat as a contract violation.
        if (process.env.NODE_ENV === 'development') {
            if (
                res.data &&
                typeof res.data === 'object' &&
                'data' in res.data &&
                'success' in res.data
            ) {
                console.error(
                    '[API Contract Violation] Endpoint appears to be double-wrapping its response.\n' +
                    'URL:', res.config?.url, '\nReceived payload:', res.data,
                    '\nFix: replace sendSuccess({ data: X }) with sendSuccess(X) in the route handler.'
                );
            }
        }

        return res;
    },
    async (err) => {
        const originalRequest = err.config;

        if (typeof window !== 'undefined' && err.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // Reject if we are manually authenticating
            if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/register')) {
                useAuthStore.getState().logout();
                return Promise.reject(err);
            }

            const refreshToken = localStorage.getItem('refreshToken');

            if (!refreshToken) {
                useAuthStore.getState().logout();
                return Promise.reject(err);
            }

            if (isRefreshing) {
                return new Promise(function(resolve, reject) {
                    failedQueue.push({ resolve, reject });
                })
                .then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                })
                .catch(err => Promise.reject(err));
            }

            isRefreshing = true;

            try {
                // IMPORTANT: Use raw `axios` (not `api`) here to bypass the response interceptor.
                // The raw response has shape: { success: true, data: { accessToken, refreshToken } }
                // Since the interceptor does NOT run, we access `.data.data` — this is intentional
                // and is the ONLY place in the codebase where `.data.data` is valid.
                const { data: rawResponse } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken }, {
                    headers: { 'Content-Type': 'application/json' }
                });

                const newAccessToken = rawResponse.data.accessToken;
                const newRefreshToken = rawResponse.data.refreshToken;

                localStorage.setItem('accessToken', newAccessToken);
                localStorage.setItem('refreshToken', newRefreshToken);
                document.cookie = `accessToken=${newAccessToken}; path=/; SameSite=Strict`;

                const store = useAuthStore.getState();
                if (store.user) {
                    store.setAuth(store.user, newAccessToken, newRefreshToken);
                }

                processQueue(null, newAccessToken);
                
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return api(originalRequest);
            } catch (refreshErr) {
                processQueue(refreshErr, null);
                useAuthStore.getState().logout();
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        } else if (typeof window !== 'undefined' && err.response?.status === 402 && err.response?.data?.error?.code === 'WORKSPACE_LOCKED') {
            window.location.href = '/workspace/unlock';
        }

        return Promise.reject(err);
    }
);

export default api;
