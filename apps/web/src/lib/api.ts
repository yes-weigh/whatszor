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

// On 401, clear token and redirect to login; on 402, redirect to paywall
api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (typeof window !== 'undefined') {
            if (err.response?.status === 401) {
                useAuthStore.getState().logout();
                window.location.href = '/login';
            } else if (err.response?.status === 402) {
                window.location.href = '/workspace/unlock';
            }
        }
        return Promise.reject(err);
    }
);

export default api;
