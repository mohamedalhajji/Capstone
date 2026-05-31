export type SensorType =
    | 'motion'
    | 'gas'
    | 'smoke'
    | 'flame'
    | 'door'
    | 'vibration'
    | 'window_vibration'
    | 'nfc';

export type SensorStatus = 'idle' | 'triggered' | 'safe' | 'warning' | 'critical';

export interface SensorItem {
    id: string;
    type: SensorType;
    label: string;
    location: string;
    status: SensorStatus;
    value?: string | number | boolean;
    lastUpdated: string;
}
