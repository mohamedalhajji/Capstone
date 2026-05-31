import axios from 'axios';

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.101:5000/api';

export const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});
