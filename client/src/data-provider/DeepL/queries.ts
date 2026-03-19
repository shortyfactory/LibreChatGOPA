import { useRecoilValue } from 'recoil';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import store from '~/store';

export const useGetDeepLLanguagesQuery = <TData = t.DeepLLanguagesResponse>(
  config?: UseQueryOptions<t.DeepLLanguagesResponse, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);

  return useQuery<t.DeepLLanguagesResponse, unknown, TData>(
    [QueryKeys.deeplLanguages],
    () => dataService.getDeepLLanguages(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};
