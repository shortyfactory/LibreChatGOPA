import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import type * as t from 'librechat-data-provider';

const invalidateDeepLAnalytics = (queryClient: QueryClient) => {
  queryClient.invalidateQueries([QueryKeys.adminDeepLJobs]);
};

export const useUploadDeepLDocumentMutation = (
  options?: t.DeepLUploadOptions,
): UseMutationResult<t.DeepLUploadResponse, unknown, FormData, unknown> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.deeplUpload], {
    mutationFn: (formData: FormData) => dataService.uploadDeepLDocument(formData),
    ...(options ?? {}),
    onSuccess: (data, variables, context) => {
      invalidateDeepLAnalytics(queryClient);
      options?.onSuccess?.(data, variables, context);
    },
  });
};

export const useCheckDeepLDocumentStatusMutation = (
  options?: t.DeepLStatusOptions,
): UseMutationResult<t.DeepLStatusResponse, unknown, t.DeepLDocumentHandle, unknown> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.deeplStatus], {
    mutationFn: (payload: t.DeepLDocumentHandle) => dataService.getDeepLDocumentStatus(payload),
    ...(options ?? {}),
    onSuccess: (data, variables, context) => {
      if (data.isError || data.isReady) {
        invalidateDeepLAnalytics(queryClient);
      }

      options?.onSuccess?.(data, variables, context);
    },
  });
};

export const useDownloadDeepLDocumentMutation = (
  options?: t.DeepLDownloadOptions,
): UseMutationResult<AxiosResponse<Blob>, unknown, t.DeepLDocumentHandle, unknown> => {
  const queryClient = useQueryClient();

  return useMutation([MutationKeys.deeplDownload], {
    mutationFn: (payload: t.DeepLDocumentHandle) => dataService.downloadDeepLDocument(payload),
    ...(options ?? {}),
    onSuccess: (data, variables, context) => {
      invalidateDeepLAnalytics(queryClient);
      options?.onSuccess?.(data, variables, context);
    },
  });
};
