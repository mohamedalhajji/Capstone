import axios from 'axios';

export const PRODUCTION_API_URL =
    process.env.EXPO_PUBLIC_API_URL ??
    'https://home-security-backend.onrender.com/api';

export const api = axios.create({
    baseURL: PRODUCTION_API_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

export function setAuthToken(token: string | null) {
    if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
        delete api.defaults.headers.common.Authorization;
    }
}

export function getApiBaseUrl() {
    return api.defaults.baseURL ?? PRODUCTION_API_URL;
}

export function getApiErrorMessage(error: unknown, fallback = 'Unknown error') {
    if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error || error.response?.data?.message;
        if (typeof message === 'string' && message.trim().length > 0) {
            return message;
        }
    }

    return error instanceof Error ? error.message : fallback;
}
