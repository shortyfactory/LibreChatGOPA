import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

const invalidateAdminUsers = (queryClient: QueryClient) => {
  queryClient.invalidateQueries([QueryKeys.adminUsers]);
  queryClient.invalidateQueries([QueryKeys.adminModeration]);
};

const invalidateAdminAnalytics = (queryClient: QueryClient) => {
  queryClient.invalidateQueries([QueryKeys.adminAnalyticsUsers]);
  queryClient.invalidateQueries([QueryKeys.adminDeepLJobs]);
};

export const useAdminBanUserMutation = (
  options?: t.AdminBanUserOptions,
): UseMutationResult<t.AdminBanUserResponse, unknown, t.AdminBanUserRequest, unknown> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.adminBanUser], {
    mutationFn: (payload: t.AdminBanUserRequest) => dataService.banAdminUser(payload),
    ...(options ?? {}),
    onSuccess: (data, variables, context) => {
      invalidateAdminUsers(queryClient);
      options?.onSuccess?.(data, variables, context);
    },
  });
};

export const useAdminUnbanUserMutation = (
  options?: t.AdminUnbanUserOptions,
): UseMutationResult<t.AdminUnbanUserResponse, unknown, t.AdminUnbanUserRequest, unknown> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.adminUnbanUser], {
    mutationFn: (payload: t.AdminUnbanUserRequest) => dataService.unbanAdminUser(payload),
    ...(options ?? {}),
    onSuccess: (data, variables, context) => {
      invalidateAdminUsers(queryClient);
      options?.onSuccess?.(data, variables, context);
    },
  });
};

export const useAdminResetPasswordMutation = (
  options?: t.AdminResetPasswordOptions,
): UseMutationResult<
  t.AdminResetPasswordResponse,
  unknown,
  t.AdminResetPasswordRequest,
  unknown
> => {
  return useMutation([MutationKeys.adminResetPassword], {
    mutationFn: (payload: t.AdminResetPasswordRequest) =>
      dataService.resetAdminUserPassword(payload),
    ...(options ?? {}),
  });
};

export const useAdminDeleteUserMutation = (
  options?: t.AdminDeleteUserOptions,
): UseMutationResult<t.AdminDeleteUserResponse, unknown, t.AdminDeleteUserRequest, unknown> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.adminDeleteUser], {
    mutationFn: (payload: t.AdminDeleteUserRequest) => dataService.deleteAdminUser(payload),
    ...(options ?? {}),
    onSuccess: (data, variables, context) => {
      invalidateAdminUsers(queryClient);
      invalidateAdminAnalytics(queryClient);
      queryClient.invalidateQueries([QueryKeys.files]);
      options?.onSuccess?.(data, variables, context);
    },
  });
};

export const useAdminUpdateFileRetentionMutation = (
  options?: t.AdminUpdateFileRetentionOptions,
): UseMutationResult<
  t.AdminFileRetentionUpdateResponse,
  unknown,
  t.AdminFileRetentionUpdateInput,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.adminUpdateFileRetention], {
    mutationFn: (payload: t.AdminFileRetentionUpdateInput) =>
      dataService.updateAdminFileRetention(payload),
    ...(options ?? {}),
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData<t.AdminFileRetentionResponse>([QueryKeys.adminFileRetention], data);
      options?.onSuccess?.(data, variables, context);
    },
  });
};

export const useAdminPurgeFileRetentionMutation = (
  options?: t.AdminPurgeFileRetentionOptions,
): UseMutationResult<t.AdminFileRetentionPurgeResponse, unknown, void, unknown> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.adminPurgeFileRetention], {
    mutationFn: () => dataService.purgeAdminFileRetention(),
    ...(options ?? {}),
    onSuccess: (data, variables, context) => {
      invalidateAdminAnalytics(queryClient);
      queryClient.invalidateQueries([QueryKeys.files]);
      options?.onSuccess?.(data, variables, context);
    },
  });
};
