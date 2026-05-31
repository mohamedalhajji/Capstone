import { api } from '../api/client';
import { SystemMode, SystemState } from '../types/system';

type BackendSystemState = {
    current_mode: SystemMode;
    buzzer_on: boolean;
    sprinkler_on: boolean;
    door_locked: boolean;
    updated_at: string;
};

function mapSystemState(row: BackendSystemState): SystemState {
    return {
        mode: row.current_mode,
        actuators: {
            buzzerOn: row.buzzer_on,
            sprinklerOn: row.sprinkler_on,
            doorLocked: row.door_locked,
        },
        lastUpdated: row.updated_at,
    };
}

export const systemService = {
    async getState(): Promise<SystemState> {
        const { data } = await api.get<BackendSystemState>('/system-state');
        return mapSystemState(data);
    },

    async setMode(mode: SystemMode): Promise<SystemState> {
        const { data } = await api.put<BackendSystemState>('/system-mode', { mode });
        return mapSystemState(data);
    },

    async resetSystem(): Promise<void> {
        await api.post('/reset-system');
    },

    async fullReset(): Promise<void> {
        await api.post('/full-reset');
    },
};
