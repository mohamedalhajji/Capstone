import { useQuery } from '@tanstack/react-query';
import { sensorService } from '../services/sensorService';

export function useSensors() {
    return useQuery({
        queryKey: ['sensors'],
        queryFn: sensorService.getSensors,
        refetchInterval: 3000,
    });
}