import { useQuery } from '@tanstack/react-query';
import { accessLogService } from '../services/accessLogService';

export function useAccessLogs() {
    return useQuery({
        queryKey: ['access-logs'],
        queryFn: accessLogService.getAccessLogs,
        refetchInterval: 3000,
    });
}
