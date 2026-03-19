import { useMutation } from '@tanstack/react-query';
import { MutationKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useMapSDGMutation = (
  options?: t.SDGMapOptions,
): UseMutationResult<t.SDGMapResponse, unknown, FormData, unknown> => {
  return useMutation([MutationKeys.mapSDG], {
    mutationFn: (formData: FormData) => dataService.mapSDG(formData),
    ...(options ?? {}),
  });
};
