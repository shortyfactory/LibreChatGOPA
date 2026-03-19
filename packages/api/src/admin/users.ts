import { extractAdminBans, readAdminStoreEntries } from './moderation';
import {
  createAdminTotalPages,
  escapeAdminRegExp,
  parseAdminLimit,
  parseAdminPage,
  parseAdminSearch,
  toAdminDateString,
  toIntegerOrFallback,
} from './utils';
import type { AdminStoreLike } from './moderation';
import type {
  AdminBanUserResponse,
  AdminDeleteUserResponse,
  AdminResetPasswordResponse,
  AdminResetPasswordResult,
  AdminUnbanUserResponse,
  AdminUsersListQuery,
  AdminUsersResponse,
} from './types';

interface AdminUserRow {
  _id: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  role?: string | null;
  provider?: string | null;
  emailVerified?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

interface AdminSearchFieldFilter {
  $regex: string;
  $options: 'i';
}

interface AdminSearchEmailFilter {
  email: AdminSearchFieldFilter;
}

interface AdminSearchUsernameFilter {
  username: AdminSearchFieldFilter;
}

interface AdminSearchNameFilter {
  name: AdminSearchFieldFilter;
}

export interface AdminUserSearchFilter {
  $or?: Array<AdminSearchEmailFilter | AdminSearchUsernameFilter | AdminSearchNameFilter>;
}

export interface AdminUserSearchParams {
  limit: number;
  page: number;
  search: string;
  skip: number;
  filter: AdminUserSearchFilter;
}

const MAX_ADMIN_BAN_MINUTES = 60 * 24 * 30;
const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export const createAdminUserSearchParams = (
  query: AdminUsersListQuery = {},
): AdminUserSearchParams => {
  const limit = parseAdminLimit(query.limit);
  const page = parseAdminPage(query.page);
  const search = parseAdminSearch(query.search);
  const escapedSearch = escapeAdminRegExp(search);
  const filter: AdminUserSearchFilter =
    search.length === 0
      ? {}
      : {
          $or: [
            { email: { $regex: escapedSearch, $options: 'i' } },
            { username: { $regex: escapedSearch, $options: 'i' } },
            { name: { $regex: escapedSearch, $options: 'i' } },
          ],
        };

  return {
    limit,
    page,
    search,
    skip: (page - 1) * limit,
    filter,
  };
};

const getActiveBanUserIds = (banEntries: Awaited<ReturnType<typeof readAdminStoreEntries>>) => {
  const activeBanUserIds = new Set<string>();
  const bans = extractAdminBans(banEntries);

  for (const ban of bans) {
    if (ban.isActive !== true) {
      continue;
    }

    if (typeof ban.user_id === 'string' && ban.user_id.length > 0) {
      activeBanUserIds.add(ban.user_id);
    }

    if (MONGO_OBJECT_ID_PATTERN.test(ban.key)) {
      activeBanUserIds.add(ban.key);
    }
  }

  return activeBanUserIds;
};

export const createAdminUsersResponse = async ({
  query = {},
  totalUsers,
  users,
  banStore,
}: {
  query?: AdminUsersListQuery;
  totalUsers: number;
  users: AdminUserRow[];
  banStore: AdminStoreLike;
}): Promise<AdminUsersResponse> => {
  const { limit, page, search } = createAdminUserSearchParams(query);
  const banEntries = await readAdminStoreEntries(banStore);
  const activeBanUserIds = getActiveBanUserIds(banEntries);

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
        email: user.email ?? null,
        username: user.username ?? null,
        name: user.name ?? null,
        role: user.role ?? null,
        provider: user.provider ?? 'email',
        emailVerified: user.emailVerified ?? false,
        createdAt: toAdminDateString(user.createdAt),
        updatedAt: toAdminDateString(user.updatedAt),
        isBanned: activeBanUserIds.has(id),
      };
    }),
  };
};

export const parseAdminBanDurationMinutes = (
  value: number | string | null | undefined,
  fallback = 120,
): number => {
  const parsedValue = toIntegerOrFallback(value, fallback);
  if (parsedValue <= 0) {
    return fallback;
  }

  return Math.min(parsedValue, MAX_ADMIN_BAN_MINUTES);
};

export const createAdminBanResponse = (
  userId: string,
  durationMinutes: number,
  expiresAt: number,
): AdminBanUserResponse => {
  return {
    message: `User banned for ${durationMinutes} minute(s)`,
    userId,
    durationMinutes,
    expiresAt,
  };
};

export const createAdminUnbanResponse = (userId: string): AdminUnbanUserResponse => {
  return {
    message: 'User unbanned',
    userId,
  };
};

export const createAdminResetPasswordResponse = (
  userId: string,
  result: AdminResetPasswordResult,
): AdminResetPasswordResponse => {
  return {
    message: result.message ?? 'Password reset flow triggered',
    userId,
    ...(result.link != null ? { link: result.link } : {}),
  };
};

export const createAdminDeleteUserResponse = (
  userId: string,
  email: string | null,
): AdminDeleteUserResponse => {
  return {
    message: 'User deleted successfully',
    userId,
    email,
  };
};
