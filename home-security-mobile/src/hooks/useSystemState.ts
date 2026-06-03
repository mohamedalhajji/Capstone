import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemService } from '../services/systemService';
import { SystemMode } from '../types/system';

export function useSystemState() {
  const queryClient = useQueryClient();

  const stateQuery = useQuery({
    queryKey: ['system-state'],
    queryFn: systemService.getState,
    refetchInterval: 3000,
  });

  const setModeMutation = useMutation({
    mutationFn: (mode: SystemMode) => systemService.setMode(mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-state'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const fullResetMutation = useMutation({
    mutationFn: systemService.fullReset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-state'] });
      queryClient.invalidateQueries({ queryKey: ['sensors'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['access-logs'] });
    },
  });

  const resetSensorsMutation = useMutation({
    mutationFn: systemService.resetSensors,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-state'] });
      queryClient.invalidateQueries({ queryKey: ['sensors'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const espWifiResetMutation = useMutation({
    mutationFn: systemService.requestEspWifiReset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-state'] });
    },
  });

  return {
    ...stateQuery,
    setMode: setModeMutation.mutateAsync,
    settingMode: setModeMutation.isPending,
    fullReset: fullResetMutation.mutateAsync,
    fullResetting: fullResetMutation.isPending,
    resetSensors: resetSensorsMutation.mutateAsync,
    resettingSensors: resetSensorsMutation.isPending,
    requestEspWifiReset: espWifiResetMutation.mutateAsync,
    requestingEspWifiReset: espWifiResetMutation.isPending,
  };
}
