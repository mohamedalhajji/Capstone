export type EventSeverity = 'info' | 'low' | 'warning' | 'high' | 'critical';

export interface EventItem {
    id: string;
    type: string;
    title: string;
    message: string;
    severity: EventSeverity;
    actionTaken?: string;
    sensorName?: string;
    location?: string;
    createdAt: string;
}
