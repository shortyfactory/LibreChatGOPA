import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
} from '@librechat/data-schemas';
import {
  createAdminTotalPages,
  hasAdminValue,
  parseAdminLimit,
  parseAdminPage,
  parseAdminSearch,
  toAdminDateString,
  toBooleanOrFallback,
} from './utils';
import type {
  DeepLJobSearchParams,
  DeepLJobSearchResult,
  SidebarFileRetentionSettings,
} from '@librechat/data-schemas';
import type {
  AdminAnalyticsUsersQuery,
  AdminAnalyticsUsersResponse,
  AdminDeepLJobsQuery,
  AdminDeepLJobsResponse,
  AdminFileRetentionResponse,
  AdminFileRetentionUpdateInput,
  AdminFileRetentionUpdateResponse,
  AdminFileRetentionValidationResult,
} from './types';

interface AdminAnalyticsUserRow {
  _id: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  role?: string | null;
}

interface AdminCountRow {
  _id: string;
  count?: number;
}

const createCountMap = (rows: AdminCountRow[]): Map<string, number> => {
  const result = new Map<string, number>();

  for (const row of rows) {
    result.set(String(row._id), Number(row.count ?? 0));
  }

  return result;
};

export const createAdminAnalyticsUsersResponse = ({
  query = {},
  totalUsers,
  users,
  promptCounts,
  promptGroupCounts,
  presetCounts,
  fileCounts,
  uploadCountMap,
}: {
  query?: AdminAnalyticsUsersQuery;
  totalUsers: number;
  users: AdminAnalyticsUserRow[];
  promptCounts: AdminCountRow[];
  promptGroupCounts: AdminCountRow[];
  presetCounts: AdminCountRow[];
  fileCounts: AdminCountRow[];
  uploadCountMap: ReadonlyMap<string, number>;
}): AdminAnalyticsUsersResponse => {
  const limit = parseAdminLimit(query.limit);
  const page = parseAdminPage(query.page);
  const search = parseAdminSearch(query.search);
  const promptMap = createCountMap(promptCounts);
  const promptGroupMap = createCountMap(promptGroupCounts);
  const presetMap = createCountMap(presetCounts);
  const fileMap = createCountMap(fileCounts);

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      search,
    },
    pagination: {
      page,
      limit,
      totalUsers,
      totalPages: createAdminTotalPages(limit, totalUsers),
    },
    users: users.map((user) => {
      const id = String(user._id);
      return {
        id,
        username: user.username ?? user.name ?? user.email ?? id,
        email: user.email ?? null,
        isSuperadmin: user.role === 'ADMIN',
        prompts: promptMap.get(id) ?? 0,
        ownPromptsLibrary: promptGroupMap.get(id) ?? 0,
        ownPresetsLibrary: presetMap.get(id) ?? 0,
        uploadFiles: Math.max(fileMap.get(id) ?? 0, uploadCountMap.get(id) ?? 0),
      };
    }),
  };
};

export const createAdminFileRetentionConstraints = () => {
  return {
    defaultRetentionDays: DEFAULT_RETENTION_DAYS,
    minRetentionDays: MIN_RETENTION_DAYS,
    maxRetentionDays: MAX_RETENTION_DAYS,
  };
};

export const createAdminFileRetentionResponse = (
  settings: SidebarFileRetentionSettings,
): AdminFileRetentionResponse => {
  return {
    settings: {
      enabled: settings.enabled,
      retentionDays: settings.retentionDays,
      updatedAt: toAdminDateString(settings.updatedAt),
    },
    constraints: createAdminFileRetentionConstraints(),
  };
};

export const validateAdminFileRetentionUpdate = (
  input: AdminFileRetentionUpdateInput,
): AdminFileRetentionValidationResult => {
  const enabled = toBooleanOrFallback(input.enabled, false);
  const hasRetentionDays = hasAdminValue(input.retentionDays);
  const parsedRetentionDays = Number.parseInt(String(input.retentionDays ?? ''), 10);

  if (
    hasRetentionDays &&
    (!Number.isFinite(parsedRetentionDays) ||
      parsedRetentionDays < MIN_RETENTION_DAYS ||
      parsedRetentionDays > MAX_RETENTION_DAYS)
  ) {
    return {
      ok: false,
      message: `Retention days must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
    };
  }

  if (enabled && !hasRetentionDays) {
    return {
      ok: false,
      message: 'Retention days are required when automatic cleanup is enabled',
    };
  }

  return {
    ok: true,
    update: {
      enabled,
      ...(hasRetentionDays ? { retentionDays: parsedRetentionDays } : {}),
    },
  };
};

export const createAdminFileRetentionUpdateResponse = (
  settings: SidebarFileRetentionSettings,
): AdminFileRetentionUpdateResponse => {
  return {
    updated: true,
    settings: {
      enabled: settings.enabled,
      retentionDays: settings.retentionDays,
      updatedAt: toAdminDateString(settings.updatedAt),
    },
    constraints: createAdminFileRetentionConstraints(),
  };
};

export const createAdminDeepLJobSearchParams = (
  query: AdminDeepLJobsQuery = {},
): DeepLJobSearchParams => {
  return {
    page: parseAdminPage(query.page),
    limit: parseAdminLimit(query.limit),
    search: parseAdminSearch(query.search),
    status: parseAdminSearch(query.status),
    userId: parseAdminSearch(query.userId),
    dateFrom: parseAdminSearch(query.dateFrom),
    dateTo: parseAdminSearch(query.dateTo),
  };
};

export const createAdminDeepLJobsResponse = (
  queryResult: DeepLJobSearchResult,
): AdminDeepLJobsResponse => {
  return {
    generatedAt: new Date().toISOString(),
    filters: queryResult.filters,
    pagination: queryResult.pagination,
    jobs: queryResult.jobs.map((job) => ({
      id: String(job._id),
      createdAt: toAdminDateString(job.createdAt),
      updatedAt: toAdminDateString(job.updatedAt),
      uploadedAt: toAdminDateString(job.uploadedAt),
      completedAt: toAdminDateString(job.completedAt),
      downloadedAt: toAdminDateString(job.downloadedAt),
      userId: job.userId ?? null,
      userEmail: job.userEmail ?? null,
      userName: job.userName ?? null,
      userRole: job.userRole ?? null,
      userProvider: job.userProvider ?? null,
      sourceIp: job.sourceIp ?? null,
      forwardedFor: job.forwardedFor ?? null,
      userAgent: job.userAgent ?? null,
      browserName: job.browserName ?? null,
      browserVersion: job.browserVersion ?? null,
      osName: job.osName ?? null,
      osVersion: job.osVersion ?? null,
      deviceType: job.deviceType ?? null,
      deviceVendor: job.deviceVendor ?? null,
      deviceModel: job.deviceModel ?? null,
      referer: job.referer ?? null,
      file: job.fileName ?? null,
      fileMimeType: job.fileMimeType ?? null,
      fileExtension: job.fileExtension ?? null,
      sizeBytes: Number(job.sizeBytes ?? 0),
      source: job.sourceLanguage ?? null,
      target: job.targetLanguage ?? null,
      documentId: job.documentId ?? null,
      documentKey: job.documentKey ?? null,
      uploadProviderStatus: job.uploadProviderStatus ?? null,
      uploadProviderDetails: job.uploadProviderDetails,
      latestStatusProviderDetails: job.latestStatusProviderDetails,
      statusChecks: Number(job.statusChecks ?? 0),
      downloadAttempts: Number(job.downloadAttempts ?? 0),
      status: job.status ?? null,
      error: job.error ?? null,
    })),
  };
};
