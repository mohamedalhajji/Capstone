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
    motion_hallway: 'Motion Sensor',
    motion_garage: 'Motion Sensor',
    smoke_kitchen: 'Smoke Sensor',
    smoke_hallway: 'Smoke Sensor',
    smoke_living_room: 'Smoke Sensor',
    flame_kitchen: 'Fire Sensor',
    flame_room_1: 'Fire Sensor',
    flame_room_2: 'Fire Sensor',
    window_1_reed: 'Reed Switch',
    window_2_reed: 'Reed Switch',
    window_3_reed: 'Reed Switch',
    vibration_garage_door: 'Vibration Sensor',
    nfc_main_door: 'NFC Scanner',
};

const sensorNameAliases: Record<string, string> = {
    kitchen_flame: 'flame_kitchen',
    kitchen_fire: 'flame_kitchen',
    fire_kitchen: 'flame_kitchen',
    'kitchen flame sensor': 'flame_kitchen',
    'kitchen fire sensor': 'flame_kitchen',
    'grouped flame sensors': 'flame_kitchen',
    gas_kitchen: 'smoke_kitchen',
    gas_hallway: 'smoke_hallway',
    gas_living_room: 'smoke_living_room',
};

const defaultSensors: BackendSensor[] = [
    { id: -1, sensor_name: 'motion_hallway', sensor_type: 'motion', location: 'Hallway', status: 'idle', last_value: null, updated_at: '' },
    { id: -2, sensor_name: 'motion_garage', sensor_type: 'motion', location: 'Garage', status: 'idle', last_value: null, updated_at: '' },
    { id: -3, sensor_name: 'smoke_kitchen', sensor_type: 'smoke', location: 'Kitchen', status: 'idle', last_value: null, updated_at: '' },
    { id: -4, sensor_name: 'smoke_hallway', sensor_type: 'smoke', location: 'Hallway', status: 'idle', last_value: null, updated_at: '' },
    { id: -5, sensor_name: 'smoke_living_room', sensor_type: 'smoke', location: 'Living Room', status: 'idle', last_value: null, updated_at: '' },
    { id: -6, sensor_name: 'flame_kitchen', sensor_type: 'flame', location: 'Kitchen', status: 'idle', last_value: null, updated_at: '' },
    { id: -7, sensor_name: 'flame_room_1', sensor_type: 'flame', location: 'Room 1', status: 'idle', last_value: null, updated_at: '' },
    { id: -8, sensor_name: 'flame_room_2', sensor_type: 'flame', location: 'Room 2', status: 'idle', last_value: null, updated_at: '' },
    { id: -9, sensor_name: 'window_1_reed', sensor_type: 'door', location: 'Window 1', status: 'idle', last_value: null, updated_at: '' },
    { id: -10, sensor_name: 'window_2_reed', sensor_type: 'door', location: 'Window 2', status: 'idle', last_value: null, updated_at: '' },
    { id: -11, sensor_name: 'window_3_reed', sensor_type: 'door', location: 'Window 3', status: 'idle', last_value: null, updated_at: '' },
    { id: -12, sensor_name: 'vibration_garage_door', sensor_type: 'vibration', location: 'Garage Door', status: 'idle', last_value: null, updated_at: '' },
    { id: -13, sensor_name: 'nfc_main_door', sensor_type: 'nfc', location: 'Main Door', status: 'idle', last_value: null, updated_at: '' },
];

const defaultSensorByName = new Map(defaultSensors.map((sensor) => [sensor.sensor_name, sensor]));
const defaultSensorNames = defaultSensors.map((sensor) => sensor.sensor_name);

function canonicalSensorName(name: string): string {
    const normalized = name.trim().toLowerCase();
    return sensorNameAliases[normalized] ?? normalized;
}

function normalizeBackendSensor(row: BackendSensor): BackendSensor {
    const sensorName = canonicalSensorName(row.sensor_name);
    const defaultSensor = defaultSensorByName.get(sensorName);

    return {
        ...row,
        id: defaultSensor && row.id <= 0 ? defaultSensor.id : row.id,
        sensor_name: sensorName,
        sensor_type: defaultSensor?.sensor_type ?? row.sensor_type,
        location: defaultSensor?.location ?? row.location,
    };
}

function mapSensor(row: BackendSensor): SensorItem {
    const isKnownSensor = defaultSensorByName.has(row.sensor_name);
    const status =
        row.sensor_name === 'nfc_main_door'
            ? row.last_value === 'unauthorized_alarm'
                ? 'triggered'
                : row.last_value === 'authorized_access'
                    ? 'safe'
                    : 'idle'
            : row.status;

    return {
        id: isKnownSensor ? row.sensor_name : String(row.id),
        sensorName: row.sensor_name,
        type: row.sensor_type,
        label: sensorLabels[row.sensor_name] ?? row.sensor_name,
        location: row.location,
        status,
        value: row.last_value ?? undefined,
        lastUpdated: row.updated_at,
    };
}

export function ensureDefaultSensorItems(sensors: SensorItem[] = []): SensorItem[] {
    const sensorsByName = new Map<string, SensorItem>();
    const extras: SensorItem[] = [];

    sensors.forEach((sensor) => {
        const sensorName = canonicalSensorName(sensor.sensorName ?? sensor.id);
        if (defaultSensorByName.has(sensorName)) {
            sensorsByName.set(sensorName, {
                ...sensor,
                id: sensorName,
                sensorName,
                type: defaultSensorByName.get(sensorName)?.sensor_type ?? sensor.type,
                label: sensorLabels[sensorName] ?? sensor.label,
            });
            return;
        }

        extras.push(sensor);
    });

    const knownSensors = defaultSensors.map((defaultSensor) => {
        const existing = sensorsByName.get(defaultSensor.sensor_name);
        return existing ?? mapSensor(defaultSensor);
    });

    return [...knownSensors, ...extras];
}

export const sensorService = {
    async getSensors(): Promise<SensorItem[]> {
        const { data } = await api.get<BackendSensor[]>('/sensors');
        const sensorsByName = new Map<string, BackendSensor>();

        data.map(normalizeBackendSensor).forEach((sensor) => {
            const existing = sensorsByName.get(sensor.sensor_name);
            if (!existing || sensor.id > 0) {
                sensorsByName.set(sensor.sensor_name, sensor);
            }
        });

        defaultSensors.forEach((sensor) => {
            if (!sensorsByName.has(sensor.sensor_name)) {
                sensorsByName.set(sensor.sensor_name, sensor);
            }
        });

        const knownSensors = defaultSensorNames.map((name) => sensorsByName.get(name)).filter(Boolean) as BackendSensor[];
        const extraSensors = Array.from(sensorsByName.values()).filter((sensor) => !defaultSensorByName.has(sensor.sensor_name));

        return ensureDefaultSensorItems([...knownSensors, ...extraSensors].map(mapSensor));
    },
};
