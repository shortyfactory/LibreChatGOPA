import { ViolationTypes } from 'librechat-data-provider';
import { DEFAULT_SESSION_EXPIRY, DEFAULT_REFRESH_TOKEN_EXPIRY } from '@librechat/data-schemas';
import { math } from '../utils/math';
import { parseAdminLimit, toIntegerOrFallback, toBooleanOrFallback } from './utils';
import type {
  AdminAuthContext,
  AdminAuthSessionConfig,
  AdminBanEvent,
  AdminConfiguredLimit,
  AdminModerationQuery,
  AdminModerationResponse,
  AdminViolationEvent,
} from './types';

interface AdminStoreEntriesSource {
  entries?: () => Iterable<[string, unknown]>;
  iterator?: () => AsyncIterable<[string, unknown]>;
}

interface AdminStoreOptions {
  deserialize?: (value: string) => unknown;
  store?: AdminStoreEntriesSource;
}

export interface AdminStoreLike extends AdminStoreEntriesSource {
  opts?: AdminStoreOptions;
}

interface PlainObject {
  [key: string]: unknown;
}

interface ConfiguredLimitDraft {
  key: string;
  label: string;
  values: AdminConfiguredLimit['values'];
  env: string[];
}

const MAX_ADMIN_SCAN = 10000;

const isPlainObject = (value: unknown): value is PlainObject => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const unwrapStoreValue = (value: unknown): unknown => {
  if (isPlainObject(value) && 'value' in value) {
    return value.value;
  }

  return value;
};

const getStringValue = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};

const getNumberValue = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const getBooleanValue = (value: unknown): boolean | undefined => {
  return typeof value === 'boolean' ? value : undefined;
};

const hasEnvValue = (value: string | undefined): boolean => {
  return typeof value === 'string' && value.trim().length > 0;
};

export const readAdminStoreEntries = async (
  store: AdminStoreLike,
  maxScan = MAX_ADMIN_SCAN,
): Promise<Array<[string, unknown]>> => {
  const rows: Array<[string, unknown]> = [];

  if (typeof store.iterator === 'function') {
    let index = 0;
    for await (const [key, value] of store.iterator()) {
      rows.push([key, value]);
      index += 1;
      if (index >= maxScan) {
        break;
      }
    }
    return rows;
  }

  if (typeof store.opts?.store?.iterator === 'function') {
    let index = 0;
    for await (const [key, value] of store.opts.store.iterator()) {
      rows.push([key, value]);
      index += 1;
      if (index >= maxScan) {
        break;
      }
    }
    return rows;
  }

  if (typeof store.opts?.store?.entries !== 'function') {
    return rows;
  }

  let index = 0;
  for (const [key, rawValue] of store.opts.store.entries()) {
    let value = rawValue;
    if (typeof rawValue === 'string' && typeof store.opts?.deserialize === 'function') {
      try {
        value = store.opts.deserialize(rawValue);
      } catch {
        value = rawValue;
      }
    }

    rows.push([key, value]);
    index += 1;
    if (index >= maxScan) {
      break;
    }
  }

  return rows;
};

export const extractAdminViolations = (
  entries: Array<[string, unknown]>,
): AdminViolationEvent[] => {
  const violations: AdminViolationEvent[] = [];

  for (const [key, value] of entries) {
    const payload = unwrapStoreValue(value);
    if (!Array.isArray(payload)) {
      continue;
    }

    for (const item of payload) {
      if (!isPlainObject(item)) {
        continue;
      }

      violations.push({
        key,
        type: getStringValue(item.type),
        date: getStringValue(item.date),
        limiter: getStringValue(item.limiter),
        max: getNumberValue(item.max),
        windowInMinutes: getNumberValue(item.windowInMinutes),
        violation_count: getNumberValue(item.violation_count),
        ban: getBooleanValue(item.ban),
      });
    }
  }

  return violations.sort((left, right) => {
    const leftTimestamp = left.date ? new Date(left.date).getTime() : 0;
    const rightTimestamp = right.date ? new Date(right.date).getTime() : 0;
    return rightTimestamp - leftTimestamp;
  });
};

export const extractAdminBans = (entries: Array<[string, unknown]>): AdminBanEvent[] => {
  const currentTime = Date.now();
  const bans: AdminBanEvent[] = [];

  for (const [key, value] of entries) {
    const payload = unwrapStoreValue(value);
    if (!isPlainObject(payload)) {
      continue;
    }

    const expiresAt = getNumberValue(payload.expiresAt);
    const timeLeftMs = Math.max(0, Number(expiresAt ?? 0) - currentTime);

    bans.push({
      key,
      type: getStringValue(payload.type),
      user_id: getStringValue(payload.user_id),
      violation_count: getNumberValue(payload.violation_count),
      expiresAt,
      timeLeftMs,
      isActive: timeLeftMs > 0,
      byAdmin: getBooleanValue(payload.byAdmin),
      by: getStringValue(payload.by),
    });
  }

  return bans.sort((left, right) => Number(right.expiresAt ?? 0) - Number(left.expiresAt ?? 0));
};

export const detectAdminAuthContext = (env: NodeJS.ProcessEnv = process.env): AdminAuthContext => {
  const issuer = env.OPENID_ISSUER ?? '';
  const openidEnabled =
    hasEnvValue(env.OPENID_CLIENT_ID) &&
    hasEnvValue(env.OPENID_CLIENT_SECRET) &&
    hasEnvValue(env.OPENID_SESSION_SECRET) &&
    hasEnvValue(issuer);
  const localEmailEnabled = toBooleanOrFallback(env.ALLOW_EMAIL_LOGIN, true);
  const issuerNormalized = issuer.toLowerCase();

  let provider: AdminAuthContext['provider'] = null;
  if (
    issuerNormalized.includes('login.microsoftonline.com') ||
    issuerNormalized.includes('entra')
  ) {
    provider = 'microsoft';
  } else if (issuerNormalized.includes('google')) {
    provider = 'google';
  } else if (issuerNormalized.includes('okta')) {
    provider = 'okta';
  } else if (issuerNormalized.includes('auth0')) {
    provider = 'auth0';
  } else if (openidEnabled) {
    provider = 'openid';
  }

  let mode: AdminAuthContext['mode'] = 'unknown';
  if (openidEnabled && !localEmailEnabled) {
    mode = 'openid-only';
  } else if (openidEnabled && localEmailEnabled) {
    mode = 'hybrid';
  } else if (!openidEnabled && localEmailEnabled) {
    mode = 'local-only';
  }

  return {
    mode,
    provider,
    issuer: issuer || null,
    openidEnabled,
    localEmailEnabled,
  };
};

export const createAdminAuthSessionConfig = (
  env: NodeJS.ProcessEnv = process.env,
): AdminAuthSessionConfig => {
  return {
    sessionExpiryMs: math(env.SESSION_EXPIRY, DEFAULT_SESSION_EXPIRY),
    refreshTokenExpiryMs: math(env.REFRESH_TOKEN_EXPIRY, DEFAULT_REFRESH_TOKEN_EXPIRY),
    sessionExpiryRaw: env.SESSION_EXPIRY ?? String(DEFAULT_SESSION_EXPIRY),
    refreshTokenExpiryRaw: env.REFRESH_TOKEN_EXPIRY ?? String(DEFAULT_REFRESH_TOKEN_EXPIRY),
  };
};

export const createAdminConfiguredLimits = (
  authContext: AdminAuthContext,
  env: NodeJS.ProcessEnv = process.env,
): AdminConfiguredLimit[] => {
  const rows: ConfiguredLimitDraft[] = [
    {
      key: 'login',
      label: 'Login',
      values: {
        max: toIntegerOrFallback(env.LOGIN_MAX, 7),
        windowMinutes: toIntegerOrFallback(env.LOGIN_WINDOW, 5),
      },
      env: ['LOGIN_MAX', 'LOGIN_WINDOW'],
    },
    {
      key: 'register',
      label: 'Register',
      values: {
        max: toIntegerOrFallback(env.REGISTER_MAX, 5),
        windowMinutes: toIntegerOrFallback(env.REGISTER_WINDOW, 60),
      },
      env: ['REGISTER_MAX', 'REGISTER_WINDOW'],
    },
    {
      key: 'messages',
      label: 'Messages',
      values: {
        ipEnabled: toBooleanOrFallback(env.LIMIT_MESSAGE_IP, true),
        ipMax: toIntegerOrFallback(env.MESSAGE_IP_MAX, 40),
        ipWindowMinutes: toIntegerOrFallback(env.MESSAGE_IP_WINDOW, 1),
        userEnabled: toBooleanOrFallback(env.LIMIT_MESSAGE_USER, false),
        userMax: toIntegerOrFallback(env.MESSAGE_USER_MAX, 40),
        userWindowMinutes: toIntegerOrFallback(env.MESSAGE_USER_WINDOW, 1),
        concurrentMax: toIntegerOrFallback(env.CONCURRENT_MESSAGE_MAX, 2),
      },
      env: [
        'LIMIT_MESSAGE_IP',
        'MESSAGE_IP_MAX',
        'MESSAGE_IP_WINDOW',
        'LIMIT_MESSAGE_USER',
        'MESSAGE_USER_MAX',
        'MESSAGE_USER_WINDOW',
        'CONCURRENT_MESSAGE_MAX',
      ],
    },
    {
      key: 'file_uploads',
      label: 'File Uploads',
      values: {
        ipMax: toIntegerOrFallback(env.FILE_UPLOAD_IP_MAX, 100),
        ipWindowMinutes: toIntegerOrFallback(env.FILE_UPLOAD_IP_WINDOW, 15),
        userMax: toIntegerOrFallback(env.FILE_UPLOAD_USER_MAX, 50),
        userWindowMinutes: toIntegerOrFallback(env.FILE_UPLOAD_USER_WINDOW, 15),
      },
      env: [
        'FILE_UPLOAD_IP_MAX',
        'FILE_UPLOAD_IP_WINDOW',
        'FILE_UPLOAD_USER_MAX',
        'FILE_UPLOAD_USER_WINDOW',
      ],
    },
    {
      key: 'conversations_import',
      label: 'Conversation Import',
      values: {
        ipMax: toIntegerOrFallback(env.IMPORT_IP_MAX, 100),
        ipWindowMinutes: toIntegerOrFallback(env.IMPORT_IP_WINDOW, 15),
        userMax: toIntegerOrFallback(env.IMPORT_USER_MAX, 50),
        userWindowMinutes: toIntegerOrFallback(env.IMPORT_USER_WINDOW, 15),
      },
      env: ['IMPORT_IP_MAX', 'IMPORT_IP_WINDOW', 'IMPORT_USER_MAX', 'IMPORT_USER_WINDOW'],
    },
    {
      key: 'tool_calls',
      label: 'Tool Calls',
      values: {
        userMax: 1,
        windowSeconds: 1,
      },
      env: [],
    },
    {
      key: 'fork',
      label: 'Conversation Fork',
      values: {
        ipMax: toIntegerOrFallback(env.FORK_IP_MAX, 30),
        ipWindowMinutes: toIntegerOrFallback(env.FORK_IP_WINDOW, 1),
        userMax: toIntegerOrFallback(env.FORK_USER_MAX, 7),
        userWindowMinutes: toIntegerOrFallback(env.FORK_USER_WINDOW, 1),
      },
      env: ['FORK_IP_MAX', 'FORK_IP_WINDOW', 'FORK_USER_MAX', 'FORK_USER_WINDOW'],
    },
    {
      key: 'tts',
      label: 'TTS',
      values: {
        ipMax: toIntegerOrFallback(env.TTS_IP_MAX, 100),
        ipWindowMinutes: toIntegerOrFallback(env.TTS_IP_WINDOW, 1),
        userMax: toIntegerOrFallback(env.TTS_USER_MAX, 50),
        userWindowMinutes: toIntegerOrFallback(env.TTS_USER_WINDOW, 1),
      },
      env: ['TTS_IP_MAX', 'TTS_IP_WINDOW', 'TTS_USER_MAX', 'TTS_USER_WINDOW'],
    },
    {
      key: 'stt',
      label: 'STT',
      values: {
        ipMax: toIntegerOrFallback(env.STT_IP_MAX, 100),
        ipWindowMinutes: toIntegerOrFallback(env.STT_IP_WINDOW, 1),
        userMax: toIntegerOrFallback(env.STT_USER_MAX, 50),
        userWindowMinutes: toIntegerOrFallback(env.STT_USER_WINDOW, 1),
      },
      env: ['STT_IP_MAX', 'STT_IP_WINDOW', 'STT_USER_MAX', 'STT_USER_WINDOW'],
    },
    {
      key: 'reset_password',
      label: 'Reset Password',
      values: {
        max: toIntegerOrFallback(env.RESET_PASSWORD_MAX, 2),
        windowMinutes: toIntegerOrFallback(env.RESET_PASSWORD_WINDOW, 2),
      },
      env: ['RESET_PASSWORD_MAX', 'RESET_PASSWORD_WINDOW'],
    },
    {
      key: 'verify_email',
      label: 'Verify Email',
      values: {
        max: toIntegerOrFallback(env.VERIFY_EMAIL_MAX, 2),
        windowMinutes: toIntegerOrFallback(env.VERIFY_EMAIL_WINDOW, 2),
      },
      env: ['VERIFY_EMAIL_MAX', 'VERIFY_EMAIL_WINDOW'],
    },
    {
      key: 'ban_policy',
      label: 'Ban Policy',
      values: {
        enabled: toBooleanOrFallback(env.BAN_VIOLATIONS, true),
        interval: toIntegerOrFallback(env.BAN_INTERVAL, 20),
        durationMs: toIntegerOrFallback(env.BAN_DURATION, 7200000),
      },
      env: ['BAN_VIOLATIONS', 'BAN_INTERVAL', 'BAN_DURATION'],
    },
  ];

  const conditionalKeys = new Set(['fork', 'tts', 'stt']);
  const openIdOnlyInactiveKeys = new Set(['login', 'register', 'reset_password', 'verify_email']);

  return rows.map((row) => {
    if (authContext.mode === 'openid-only' && openIdOnlyInactiveKeys.has(row.key)) {
      return {
        ...row,
        relevance: 'inactive',
        reason: 'Disabled in OpenID-only mode (no local email/password flow).',
      };
    }

    if (conditionalKeys.has(row.key)) {
      return {
        ...row,
        relevance: 'conditional',
        reason: 'Depends on feature usage and enabled endpoints.',
      };
    }

    return {
      ...row,
      relevance: 'active',
      reason: 'Active with current server configuration.',
    };
  });
};

export const createAdminModerationResponse = async ({
  query = {},
  env = process.env,
  violationStore,
  banStore,
}: {
  query?: AdminModerationQuery;
  env?: NodeJS.ProcessEnv;
  violationStore: AdminStoreLike;
  banStore: AdminStoreLike;
}): Promise<AdminModerationResponse> => {
  const limit = parseAdminLimit(query.limit);
  const authContext = detectAdminAuthContext(env);
  const authSessionConfig = createAdminAuthSessionConfig(env);
  const [violationEntries, banEntries] = await Promise.all([
    readAdminStoreEntries(violationStore),
    readAdminStoreEntries(banStore),
  ]);
  const violations = extractAdminViolations(violationEntries).slice(0, limit);
  const bans = extractAdminBans(banEntries).slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    limit,
    authContext,
    authSessionConfig,
    configuredLimits: createAdminConfiguredLimits(authContext, env),
    counts: {
      violations: violations.length,
      bans: bans.length,
    },
    violations,
    bans,
  };
};

export { ViolationTypes };
