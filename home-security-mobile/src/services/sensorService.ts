import { api } from '../api/client';
import { SensorItem } from '../types/sensor';

type BackendSensor = {
    id: number;
    sensor_type: SensorItem['type'];
    sensor_name: string;
    location: string;
    status: SensorItem['status'];
    last_value: string | number | boolean | null;
    updated_at: string;
};

function mapSensor(row: BackendSensor): SensorItem {
    return {
        id: String(row.id),
        type: row.sensor_type,
        label: row.sensor_name,
        location: row.location,
        status: row.status,
        value: row.last_value ?? undefined,
        lastUpdated: row.updated_at,
    };
}

export const sensorService = {
    async getSensors(): Promise<SensorItem[]> {
        const { data } = await api.get<BackendSensor[]>('/sensors');
        return data.map(mapSensor);
    },
};
