import { api } from '../api/client';

export const simulationService = {
    async triggerSensor(sensorName: string) {
        const { data } = await api.post('/simulate-event', { sensor_name: sensorName });
        return data;
    },

    async simulateNfc(access: 'authorized' | 'unauthorized') {
        const { data } = await api.post('/simulate-nfc', {
            authorized: access === 'authorized',
        });
        return data;
    },
};
