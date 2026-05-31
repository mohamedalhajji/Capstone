import { api } from '../api/client';
import { EventItem } from '../types/event';

type BackendEvent = {
    id: number;
    event_type: string;
    severity: EventItem['severity'];
    message: string;
    action_taken?: string;
    sensor_name?: string;
    location?: string;
    created_at: string;
};

function titleFromEventType(type: string) {
    return type
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function mapEvent(row: BackendEvent): EventItem {
    return {
        id: String(row.id),
        type: row.event_type,
        title: titleFromEventType(row.event_type),
        message: row.message,
        severity: row.severity,
        actionTaken: row.action_taken,
        sensorName: row.sensor_name,
        location: row.location,
        createdAt: row.created_at,
    };
}

export const eventService = {
    async getEvents(): Promise<EventItem[]> {
        const { data } = await api.get<BackendEvent[]>('/events');
        return data.map(mapEvent);
    },
};
