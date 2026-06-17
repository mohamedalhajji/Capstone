import { api } from '../api/client';
import { SystemMode, SystemState } from '../types/system';

type BackendSystemState = {
    current_mode: SystemMode;
    buzzer_on: boolean;
    sprinkler_on: boolean;
    door_locked: boolean;
    esp_last_seen?: string | null;
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
        espLastSeen: row.esp_last_seen ?? null,
    };
}

async function getSystemState(): Promise<SystemState> {
    const { data } = await api.get<BackendSystemState>('/system-state');
    return mapSystemState(data);
}

async function setSystemMode(mode: SystemMode): Promise<SystemState> {
    const { data } = await api.put<BackendSystemState>('/system-mode', { mode });
    return mapSystemState(data);
}

export const systemService = {
    async getState(): Promise<SystemState> {
        return getSystemState();
    },

    async setMode(mode: SystemMode): Promise<SystemState> {
        return setSystemMode(mode);
    },

    async fullReset(): Promise<SystemState> {
        const { data } = await api.post<BackendSystemState>('/full-reset');
        return mapSystemState(data);
    },

    async resetSensors(): Promise<SystemState> {
        const { data } = await api.post<BackendSystemState>('/reset-system');
        return mapSystemState(data);
    },

    async requestEspWifiReset(): Promise<void> {
        await api.post('/esp/request-wifi-reset');
    },
};
