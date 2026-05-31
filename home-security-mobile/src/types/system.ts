export type SystemMode = 'disarmed' | 'home' | 'away';

export interface ActuatorState {
    buzzerOn: boolean;
    sprinklerOn: boolean;
    doorLocked: boolean;
}

export interface SystemState {
    mode: SystemMode;
    actuators: ActuatorState;
    lastUpdated: string;
}