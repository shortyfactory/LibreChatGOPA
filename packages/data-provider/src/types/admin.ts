export type AdminQueryValue = number | string | readonly string[] | undefined;

export interface AdminMigrationState {
  lot: number;
  stage: 'skeleton';
  source: string;
  nextStep: string;
}

export type AdminUsersListQuery = {
  limit?: AdminQueryValue;
  page?: AdminQueryValue;
  search?: AdminQueryValue;
};

export type AdminModerationQuery = {
  limit?: AdminQueryValue;
};

export type AdminAnalyticsUsersQuery = {
  limit?: AdminQueryValue;
  page?: AdminQueryValue;
  search?: AdminQueryValue;
};

export type AdminDeepLJobsQuery = {
  limit?: AdminQueryValue;
  page?: AdminQueryValue;
  search?: AdminQueryValue;
  status?: AdminQueryValue;
  userId?: AdminQueryValue;
  dateFrom?: AdminQueryValue;
  dateTo?: AdminQueryValue;
};

export interface AdminUserSummary {
  id: string;
  email: string | null;
  username: string | null;
  name: string | null;
  role: string | null;
  provider: string | null;
  emailVerified: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  isBanned: boolean;
}

export interface AdminUsersResponse {
  generatedAt: string;
  filters: {
    search: string;
  };
  pagination: {
    page: number;
    limit: number;
    totalUsers: number;
    totalPages: number;
  };
  users: AdminUserSummary[];
  migration?: AdminMigrationState;
}

export interface AdminAuthContext {
  mode: 'openid-only' | 'hybrid' | 'local-only' | 'unknown';
  provider: string | null;
  issuer: string | null;
  openidEnabled: boolean;
  localEmailEnabled: boolean;
}

export interface AdminAuthSessionConfig {
  sessionExpiryMs: number;
  refreshTokenExpiryMs: number;
  sessionExpiryRaw: string;
  refreshTokenExpiryRaw: string;
}

export type AdminConfiguredLimitValue = boolean | number | string;

export interface AdminConfiguredLimitValueMap {
  [key: string]: AdminConfiguredLimitValue;
}

export interface AdminConfiguredLimit {
  key: string;
  label: string;
  values: AdminConfiguredLimitValueMap;
  env: string[];
  relevance: 'active' | 'conditional' | 'inactive';
  reason: string;
}

export interface AdminViolationEvent {
  key: string;
  type?: string;
  date?: string;
  limiter?: string;
  max?: number;
  windowInMinutes?: number;
  violation_count?: number;
  ban?: boolean;
}

export interface AdminBanEvent {
  key: string;
  type?: string;
  user_id?: string;
  violation_count?: number;
  expiresAt?: number;
  timeLeftMs?: number;
  isActive?: boolean;
  byAdmin?: boolean;
  by?: string;
}

export interface AdminModerationResponse {
  generatedAt: string;
  limit: number;
  authContext: AdminAuthContext;
  authSessionConfig: AdminAuthSessionConfig;
  configuredLimits: AdminConfiguredLimit[];
  counts: {
    violations: number;
    bans: number;
  };
  violations: AdminViolationEvent[];
  bans: AdminBanEvent[];
  migration?: AdminMigrationState;
}

export interface AdminAnalyticsUserSummary {
  id: string;
  username: string;
  email: string | null;
  isSuperadmin: boolean;
  prompts: number;
  agents: number;
  conversations: number;
  ownPromptsLibrary: number;
  ownPresetsLibrary: number;
  uploadFiles: number;
}

export interface AdminAnalyticsUsersResponse {
  generatedAt: string;
  filters: {
    search: string;
  };
  pagination: {
    page: number;
    limit: number;
    totalUsers: number;
    totalPages: number;
  };
  users: AdminAnalyticsUserSummary[];
  migration?: AdminMigrationState;
}

export interface AdminFileRetentionConstraints {
  defaultRetentionDays: number;
  minRetentionDays: number;
  maxRetentionDays: number;
}

export interface AdminSidebarFileRetentionSettings {
  enabled: boolean;
  retentionDays: number;
  updatedAt: string | null;
}

export interface AdminFileRetentionResponse {
  settings: AdminSidebarFileRetentionSettings;
  constraints: AdminFileRetentionConstraints;
}

export interface AdminFileRetentionUpdateInput {
  enabled?: boolean | number | string | null;
  retentionDays?: number | string | null;
}

export interface AdminFileRetentionUpdate {
  enabled: boolean;
  retentionDays?: number;
}

export interface AdminFileRetentionValidationResult {
  ok: boolean;
  update?: AdminFileRetentionUpdate;
  message?: string;
}

export interface AdminFileRetentionUpdateResponse {
  updated: boolean;
  settings: AdminSidebarFileRetentionSettings;
  constraints: AdminFileRetentionConstraints;
}

export interface AdminFileRetentionPurgeResponse {
  purged: boolean;
  attemptedDeletes: number;
}

export type AdminDeepLJobProviderDetailPrimitive = boolean | number | string | null;

export interface AdminDeepLJobProviderDetailObject {
  [key: string]: AdminDeepLJobProviderDetails;
}

export type AdminDeepLJobProviderDetails =
  | AdminDeepLJobProviderDetailPrimitive
  | AdminDeepLJobProviderDetailObject
  | AdminDeepLJobProviderDetails[];

export interface AdminDeepLJobSummary {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  uploadedAt: string | null;
  completedAt: string | null;
  downloadedAt: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  userProvider: string | null;
  sourceIp: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
  deviceType: string | null;
  deviceVendor: string | null;
  deviceModel: string | null;
  referer: string | null;
  file: string | null;
  fileMimeType: string | null;
  fileExtension: string | null;
  sizeBytes: number;
  source: string | null;
  target: string | null;
  documentId: string | null;
  uploadProviderStatus: string | null;
  uploadProviderDetails?: AdminDeepLJobProviderDetails;
  latestStatusProviderDetails?: AdminDeepLJobProviderDetails;
  statusChecks: number;
  downloadAttempts: number;
  status: string | null;
  error: string | null;
}

export interface AdminDeepLJobsResponse {
  generatedAt: string;
  filters: {
    search: string;
    status: string;
    userId: string;
    dateFrom: string;
    dateTo: string;
  };
  pagination: {
    page: number;
    limit: number;
    totalJobs: number;
    totalPages: number;
  };
  jobs: AdminDeepLJobSummary[];
  migration?: AdminMigrationState;
}

export interface AdminBanUserRequest {
  userId: string;
  durationMinutes?: number;
}

export interface AdminBanUserResponse {
  message: string;
  userId: string;
  durationMinutes: number;
  expiresAt: number;
}

export interface AdminUnbanUserRequest {
  userId: string;
}

export interface AdminUnbanUserResponse {
  message: string;
  userId: string;
}

export interface AdminResetPasswordRequest {
  userId: string;
}

export interface AdminResetPasswordResult {
  link?: string;
  message?: string;
}

export interface AdminResetPasswordResponse {
  message: string;
  userId: string;
  link?: string;
}

export interface AdminDeleteUserRequest {
  userId: string;
}

export interface AdminDeleteUserResponse {
  message: string;
  userId: string;
  email: string | null;
}
