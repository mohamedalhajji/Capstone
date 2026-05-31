import { useQuery } from '@tanstack/react-query';
import { healthService } from '../services/healthService';

export function useBackendHealth() {
    return useQuery({
        queryKey: ['backend-health'],
        queryFn: healthService.getHealth,
        refetchInterval: 5000,
        retry: 1,
    });
}
