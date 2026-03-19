import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Input, Spinner, useToastContext } from '@librechat/client';
import { SystemRoles } from 'librechat-data-provider';
import type { AdminUserSummary } from 'librechat-data-provider';
import {
  useAdminBanUserMutation,
  useAdminDeleteUserMutation,
  useAdminResetPasswordMutation,
  useAdminUnbanUserMutation,
  useGetAdminUsersQuery,
} from '~/data-provider';
import PageHeaderCard from '~/components/PageHeaderCard';
import { useAuthContext, useLocalize } from '~/hooks';

const PAGE_SIZE = 50;

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString();
};

const getErrorMessage = (error: unknown, fallback: string) => {
  const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  if (responseMessage) {
    return responseMessage;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
};

type ActionResult = {
  message?: string;
};

export default function AdminUsers() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  const usersQuery = useGetAdminUsersQuery(
    {
      limit: PAGE_SIZE,
      page,
      search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
    },
    {
      enabled: isAdmin,
      keepPreviousData: true,
    },
  );

  const banUserMutation = useAdminBanUserMutation();
  const unbanUserMutation = useAdminUnbanUserMutation();
  const resetPasswordMutation = useAdminResetPasswordMutation();
  const deleteUserMutation = useAdminDeleteUserMutation();

  const hasPrev = useMemo(() => (usersQuery.data?.pagination.page ?? 1) > 1, [usersQuery.data]);
  const hasNext = useMemo(() => {
    if (!usersQuery.data?.pagination) {
      return false;
    }

    return usersQuery.data.pagination.page < usersQuery.data.pagination.totalPages;
  }, [usersQuery.data]);

  const loading = usersQuery.isLoading && !usersQuery.data;
  const errorMessage = usersQuery.isError
    ? getErrorMessage(usersQuery.error, localize('com_ui_admin_load_users_error'))
    : null;

  const runAction = async (userId: string, action: () => Promise<ActionResult>) => {
    setActionUserId(userId);

    try {
      const result = await action();
      showToast({
        status: 'success',
        message: result.message ?? localize('com_ui_admin_action_completed'),
      });
    } catch (error) {
      showToast({
        status: 'error',
        message: getErrorMessage(error, localize('com_ui_admin_action_failed')),
      });
    } finally {
      setActionUserId(null);
    }
  };

  const handleBan = async (row: AdminUserSummary) => {
    const minutesRaw = window.prompt(localize('com_ui_admin_ban_prompt'), '120');
    if (minutesRaw === null) {
      return;
    }

    const durationMinutes = Number.parseInt(minutesRaw, 10);
    const safeDurationMinutes =
      Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 120;

    await runAction(row.id, () =>
      banUserMutation.mutateAsync({
        userId: row.id,
        durationMinutes: safeDurationMinutes,
      }),
    );
  };

  const handleUnban = async (row: AdminUserSummary) => {
    const confirmed = window.confirm(
      localize('com_ui_admin_unban_confirm', { target: row.email ?? row.id }),
    );
    if (!confirmed) {
      return;
    }

    await runAction(row.id, () => unbanUserMutation.mutateAsync({ userId: row.id }));
  };

  const handleResetPassword = async (row: AdminUserSummary) => {
    const confirmed = window.confirm(
      localize('com_ui_admin_reset_password_confirm', { target: row.email ?? row.id }),
    );
    if (!confirmed) {
      return;
    }

    await runAction(row.id, () => resetPasswordMutation.mutateAsync({ userId: row.id }));
  };

  const handleDelete = async (row: AdminUserSummary) => {
    const confirmed = window.confirm(
      localize('com_ui_admin_delete_confirm', { target: row.email ?? row.id }),
    );
    if (!confirmed) {
      return;
    }

    await runAction(row.id, () => deleteUserMutation.mutateAsync({ userId: row.id }));
  };

  if (!isAdmin) {
    return <Navigate to="/c/new" replace={true} />;
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeaderCard
          iconSrc="/assets/users_32.png"
          title={localize('com_ui_admin_users')}
          description={localize('com_ui_admin_users_description')}
        />

        <section className="rounded-xl border border-border-light bg-surface-secondary p-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={localize('com_ui_admin_users_search_placeholder')}
            className="w-full max-w-md"
            aria-label={localize('com_ui_search')}
          />
          <div className="mt-2 text-xs text-text-secondary">
            {localize('com_ui_admin_total_users', {
              total: usersQuery.data?.pagination.totalUsers ?? 0,
            })}
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-border-light bg-surface-secondary p-8">
            <Spinner className="size-8" />
          </div>
        ) : null}

        {!loading && errorMessage ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {!loading && !errorMessage ? (
          <>
            <div className="overflow-hidden rounded-xl border border-border-light">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-tertiary text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_auth_email')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_username')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_name')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_role')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_provider')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_verified')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_banned')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_created')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(usersQuery.data?.users ?? []).map((row) => (
                    <tr key={row.id} className="border-t border-border-light">
                      <td className="px-4 py-3 text-text-primary">{row.email ?? '-'}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.username ?? '-'}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.name ?? '-'}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.role ?? '-'}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.provider ?? '-'}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.emailVerified ? localize('com_ui_yes') : localize('com_ui_no')}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.isBanned ? localize('com_ui_active') : localize('com_ui_no')}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {!row.isBanned ? (
                            <button
                              type="button"
                              disabled={actionUserId === row.id}
                              onClick={() => handleBan(row)}
                              className="rounded-md border border-border-light px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {localize('com_ui_admin_ban')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={actionUserId === row.id}
                              onClick={() => handleUnban(row)}
                              className="rounded-md border border-border-light px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {localize('com_ui_admin_unban')}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={actionUserId === row.id}
                            onClick={() => handleResetPassword(row)}
                            className="rounded-md border border-border-light px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {localize('com_ui_admin_reset_password')}
                          </button>
                          <button
                            type="button"
                            disabled={actionUserId === row.id}
                            onClick={() => handleDelete(row)}
                            className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {localize('com_ui_delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(usersQuery.data?.users.length ?? 0) === 0 ? (
                    <tr className="border-t border-border-light">
                      <td colSpan={9} className="px-4 py-4 text-center text-text-secondary">
                        {localize('com_ui_admin_users_no_results')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border-light bg-surface-secondary p-4">
              <div className="text-sm text-text-secondary">
                {localize('com_ui_admin_page_summary', {
                  page: usersQuery.data?.pagination.page ?? 1,
                  totalPages: usersQuery.data?.pagination.totalPages ?? 1,
                })}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
                  className="rounded-md border border-border-light px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {localize('com_ui_prev')}
                </button>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                  className="rounded-md border border-border-light px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {localize('com_ui_next')}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
