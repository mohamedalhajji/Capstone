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

  const resetMutation = useMutation({
    mutationFn: systemService.resetSystem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-state'] });
      queryClient.invalidateQueries({ queryKey: ['sensors'] });
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

  return {
    ...stateQuery,
    setMode: setModeMutation.mutateAsync,
    settingMode: setModeMutation.isPending,
    resetSystem: resetMutation.mutateAsync,
    resettingSystem: resetMutation.isPending,
    fullReset: fullResetMutation.mutateAsync,
    fullResetting: fullResetMutation.isPending,
  };
}
