import { useRecoilValue } from 'recoil';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import store from '~/store';

export const useGetAdminUsersQuery = <TData = t.AdminUsersResponse>(
  params: t.AdminUsersListQuery = {},
  config?: UseQueryOptions<t.AdminUsersResponse, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.AdminUsersResponse, unknown, TData>(
    [QueryKeys.adminUsers, params],
    () => dataService.getAdminUsers(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useGetAdminModerationQuery = <TData = t.AdminModerationResponse>(
  params: t.AdminModerationQuery = {},
  config?: UseQueryOptions<t.AdminModerationResponse, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.AdminModerationResponse, unknown, TData>(
    [QueryKeys.adminModeration, params],
    () => dataService.getAdminModeration(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useGetAdminAnalyticsUsersQuery = <TData = t.AdminAnalyticsUsersResponse>(
  params: t.AdminAnalyticsUsersQuery = {},
  config?: UseQueryOptions<t.AdminAnalyticsUsersResponse, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.AdminAnalyticsUsersResponse, unknown, TData>(
    [QueryKeys.adminAnalyticsUsers, params],
    () => dataService.getAdminAnalyticsUsers(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useGetAdminFileRetentionQuery = <TData = t.AdminFileRetentionResponse>(
  config?: UseQueryOptions<t.AdminFileRetentionResponse, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.AdminFileRetentionResponse, unknown, TData>(
    [QueryKeys.adminFileRetention],
    () => dataService.getAdminFileRetention(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useGetAdminDeepLJobsQuery = <TData = t.AdminDeepLJobsResponse>(
  params: t.AdminDeepLJobsQuery = {},
  config?: UseQueryOptions<t.AdminDeepLJobsResponse, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.AdminDeepLJobsResponse, unknown, TData>(
    [QueryKeys.adminDeepLJobs, params],
    () => dataService.getAdminDeepLJobs(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};
