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

const sensorLabels: Record<string, string> = {
    motion_hallway: 'Hallway Motion Sensor',
    motion_garage: 'Garage Motion Sensor',
    gas_kitchen: 'Kitchen Gas Sensor',
    gas_hallway: 'Hallway Gas Sensor',
    gas_living_room: 'Living Room Gas Sensor',
    flame_kitchen: 'Kitchen Flame Sensor',
    flame_room_1: 'Room 1 Flame Sensor',
    flame_room_2: 'Room 2 Flame Sensor',
    window_1_reed: 'Window 1 Sensor',
    window_2_reed: 'Window 2 Sensor',
    window_3_reed: 'Window 3 Sensor',
    vibration_garage_door: 'Garage Door Vibration Sensor',
    nfc_main_door: 'Main Door NFC Reader',
};

function mapSensor(row: BackendSensor): SensorItem {
    return {
        id: String(row.id),
        type: row.sensor_type,
        label: sensorLabels[row.sensor_name] ?? row.sensor_name,
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
