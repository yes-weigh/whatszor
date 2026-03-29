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

// Intercept responses to unwrap the standardized ApiResponse wrapper
api.interceptors.response.use(
    (res) => {
        // If the response matches our standard wrapper, unwrap the data field
        if (res.data && typeof res.data === 'object' && res.data.success === true && 'data' in res.data) {
            // We replace res.data with the inner data payload to keep existing hooks working
            res.data = res.data.data;
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
                // Warning: Do not use `api.post` here or it will trigger the interceptor again
                const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken }, {
                    headers: { 'Content-Type': 'application/json' }
                });

                const newAccessToken = data.data.accessToken;
                const newRefreshToken = data.data.refreshToken;

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
        } else if (typeof window !== 'undefined' && err.response?.status === 402) {
            window.location.href = '/workspace/unlock';
        }

        return Promise.reject(err);
    }
);

export default api;
