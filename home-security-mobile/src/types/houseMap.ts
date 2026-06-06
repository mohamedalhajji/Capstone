import { SensorItem } from './sensor';

export type RoomType =
    | 'kitchen'
    | 'bedroom'
    | 'bathroom'
    | 'garage'
    | 'hallway'
    | 'living_room'
    | 'main_door'
    | 'back_door';

export type HouseMapPromptState = 'unseen' | 'accepted' | 'declined';

export type MappedDevice = {
    id: string;
    label: string;
    type: SensorItem['type'] | 'sprinkler';
    status: SensorItem['status'];
    location?: string;
};

export type HouseMapRoom = {
    id: string;
    type: RoomType;
    label: string;
    row: number;
    col: number;
    cols?: number;
    rows?: number;
    orientation?: 'horizontal' | 'vertical';
    deviceIds: string[];
};

export type HouseMapLayout = {
    rooms: HouseMapRoom[];
    promptState: HouseMapPromptState;
};
