import { useMutation, useQueryClient } from '@tanstack/react-query';
import { simulationService } from '../services/simulationService';

export function useSimulationActions() {
    const queryClient = useQueryClient();

    const triggerSensor = useMutation({
        mutationFn: (type: string) => simulationService.triggerSensor(type),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system-state'] });
            queryClient.invalidateQueries({ queryKey: ['sensors'] });
            queryClient.invalidateQueries({ queryKey: ['events'] });
            queryClient.invalidateQueries({ queryKey: ['access-logs'] });
        },
    });

    const simulateNfc = useMutation({
        mutationFn: (access: 'authorized' | 'unauthorized') =>
            simulationService.simulateNfc(access),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system-state'] });
            queryClient.invalidateQueries({ queryKey: ['sensors'] });
            queryClient.invalidateQueries({ queryKey: ['events'] });
            queryClient.invalidateQueries({ queryKey: ['access-logs'] });
        },
    });

    return {
        triggerSensor: triggerSensor.mutateAsync,
        simulateNfc: simulateNfc.mutateAsync,
        isLoading: triggerSensor.isPending || simulateNfc.isPending,
    };
}
