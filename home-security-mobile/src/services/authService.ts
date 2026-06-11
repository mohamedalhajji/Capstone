import axios from 'axios';
import { api } from '../api/client';
import { AuthSession, AuthUser } from '../types/auth';

type BackendUser = {
    id: number;
    name: string;
    email: string;
    created_at?: string;
};

type AuthResponse = {
    token: string;
    user: BackendUser;
};

function mapUser(user: BackendUser): AuthUser {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
    };
}

function mapSession(response: AuthResponse): AuthSession {
    return {
        token: response.token,
        user: mapUser(response.user),
    };
}

export const authService = {
    async login(email: string, password: string): Promise<AuthSession> {
        const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
        return mapSession(data);
    },

    async signup(name: string, email: string, password: string): Promise<AuthSession> {
        const { data } = await api.post<AuthResponse>('/auth/signup', { name, email, password });
        return mapSession(data);
    },

    async me(): Promise<AuthUser> {
        const { data } = await api.get<{ user: BackendUser }>('/auth/me');
        return mapUser(data.user);
    },

    async verifyPassword(email: string, currentPassword: string): Promise<void> {
        try {
            await api.post('/auth/verify-password', { currentPassword });
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                await api.post('/auth/login', { email, password: currentPassword });
                return;
            }
            throw error;
        }
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        try {
            await api.post('/auth/change-password', { currentPassword, newPassword });
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                throw new Error('Password change is not available on the deployed backend yet. Redeploy the backend, then try again.');
            }
            throw error;
        }
    },
};
