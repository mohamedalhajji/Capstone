import { api } from '../api/client';

export interface BackendHealth {
    ok: boolean;
    databaseTime: string;
}

export const healthService = {
    async getHealth(): Promise<BackendHealth> {
        const { data } = await api.get<BackendHealth>('/health');
        return data;
    },
};
