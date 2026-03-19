import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Input, Spinner } from '@librechat/client';
import { SystemRoles } from 'librechat-data-provider';
import {
  useAdminPurgeFileRetentionMutation,
  useAdminUpdateFileRetentionMutation,
  useGetAdminAnalyticsUsersQuery,
  useGetAdminDeepLJobsQuery,
  useGetAdminFileRetentionQuery,
} from '~/data-provider';
import SidebarReopenButton from '~/components/Nav/SidebarReopenButton';
import PageHeaderCard from '~/components/PageHeaderCard';
import { useAuthContext, useLocalize } from '~/hooks';
import { formatBytes } from '~/utils';

const PAGE_SIZE = 50;
const DEFAULT_RETENTION_CONSTRAINTS = {
  defaultRetentionDays: 30,
  minRetentionDays: 1,
  maxRetentionDays: 3650,
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const getErrorMessage = (error: unknown, fallback: string) => {
  const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  if (responseMessage) {
    return responseMessage;
  }

  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
};

export default function AdminAnalytics() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  const [tab, setTab] = useState<'users' | 'deepl'>('users');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deeplSearch, setDeeplSearch] = useState('');
  const [deeplStatus, setDeeplStatus] = useState('');
  const [deeplPage, setDeeplPage] = useState(1);
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState('');
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null);

  const usersQuery = useGetAdminAnalyticsUsersQuery(
    { limit: PAGE_SIZE, page, search: search.trim() || undefined },
    { enabled: isAdmin && tab === 'users', keepPreviousData: true },
  );
  const deeplQuery = useGetAdminDeepLJobsQuery(
    {
      limit: PAGE_SIZE,
      page: deeplPage,
      search: deeplSearch.trim() || undefined,
      status: deeplStatus || undefined,
    },
    { enabled: isAdmin && tab === 'deepl', keepPreviousData: true },
  );
  const retentionQuery = useGetAdminFileRetentionQuery({ enabled: isAdmin });
  const updateRetentionMutation = useAdminUpdateFileRetentionMutation();
  const purgeRetentionMutation = useAdminPurgeFileRetentionMutation();

  useEffect(() => {
    if (!retentionQuery.data) {
      return;
    }

    setRetentionEnabled(retentionQuery.data.settings.enabled);
    setRetentionDays(
      String(
        retentionQuery.data.settings.retentionDays ??
          retentionQuery.data.constraints.defaultRetentionDays,
      ),
    );
  }, [retentionQuery.data]);

  const retentionConstraints = retentionQuery.data?.constraints ?? DEFAULT_RETENTION_CONSTRAINTS;
  const parsedRetentionDays = Number.parseInt(retentionDays, 10);
  const retentionDaysValid =
    Number.isFinite(parsedRetentionDays) &&
    parsedRetentionDays >= retentionConstraints.minRetentionDays &&
    parsedRetentionDays <= retentionConstraints.maxRetentionDays;
  const activeQuery = tab === 'users' ? usersQuery : deeplQuery;
  const hasPrev = useMemo(
    () =>
      tab === 'users'
        ? (usersQuery.data?.pagination.page ?? 1) > 1
        : (deeplQuery.data?.pagination.page ?? 1) > 1,
    [deeplQuery.data, tab, usersQuery.data],
  );
  const hasNext = useMemo(() => {
    if (tab === 'users') {
      return (
        (usersQuery.data?.pagination.page ?? 1) < (usersQuery.data?.pagination.totalPages ?? 1)
      );
    }

    return (deeplQuery.data?.pagination.page ?? 1) < (deeplQuery.data?.pagination.totalPages ?? 1);
  }, [deeplQuery.data, tab, usersQuery.data]);

  const saveRetention = async () => {
    setRetentionMessage(null);

    try {
      await updateRetentionMutation.mutateAsync({
        enabled: retentionEnabled,
        retentionDays: retentionDaysValid ? parsedRetentionDays : retentionDays,
      });
      setRetentionMessage(localize('com_ui_saved'));
    } catch (error) {
      setRetentionMessage(getErrorMessage(error, localize('com_ui_admin_retention_save_error')));
    }
  };

  const purgeRetention = async () => {
    if (!window.confirm(localize('com_ui_admin_retention_purge_confirm'))) {
      return;
    }

    setRetentionMessage(null);

    try {
      const result = await purgeRetentionMutation.mutateAsync();
      setRetentionMessage(
        localize('com_ui_admin_retention_purged', { count: result.attemptedDeletes }),
      );
    } catch (error) {
      setRetentionMessage(getErrorMessage(error, localize('com_ui_admin_retention_purge_error')));
    }
  };

  if (!isAdmin) {
    return <Navigate to="/c/new" replace={true} />;
  }

  return (
    <div className="h-full overflow-auto p-6">
      <SidebarReopenButton />
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeaderCard
          iconSrc="/assets/analytics_32.png"
          title={localize('com_ui_admin_analytics')}
          description={localize('com_ui_admin_analytics_description')}
        />

        <div className="rounded-xl border border-border-light bg-surface-secondary p-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('users')}
              className={`rounded-md px-3 py-1 text-sm ${tab === 'users' ? 'bg-surface-tertiary text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}
            >
              {localize('com_ui_admin_users')}
            </button>
            <button
              type="button"
              onClick={() => setTab('deepl')}
              className={`rounded-md px-3 py-1 text-sm ${tab === 'deepl' ? 'bg-surface-tertiary text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}
            >
              {localize('com_ui_admin_deepl_jobs')}
            </button>
          </div>
        </div>

        {tab === 'users' ? (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={localize('com_ui_admin_users_search_placeholder')}
                className="w-full max-w-md"
              />
              <div className="mt-2 text-xs text-text-secondary">
                {localize('com_ui_admin_total_users', {
                  total: usersQuery.data?.pagination.totalUsers ?? 0,
                })}
              </div>
            </div>
            <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
              <div className="text-sm font-semibold text-text-primary">
                {localize('com_ui_admin_retention_title')}
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {localize('com_ui_admin_retention_description')}
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={retentionEnabled}
                  onChange={(event) => setRetentionEnabled(event.target.checked)}
                />
                {localize('com_ui_admin_retention_enabled')}
              </label>
              <div className="mt-3 flex gap-3">
                <Input
                  type="number"
                  min={retentionConstraints.minRetentionDays}
                  max={retentionConstraints.maxRetentionDays}
                  value={retentionDays}
                  onChange={(event) => setRetentionDays(event.target.value)}
                />
                <button
                  type="button"
                  onClick={saveRetention}
                  disabled={
                    updateRetentionMutation.isLoading ||
                    retentionQuery.isLoading ||
                    !retentionQuery.data ||
                    (retentionEnabled && !retentionDaysValid)
                  }
                  className="rounded-md border border-border-light px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {localize('com_ui_save')}
                </button>
              </div>
              <div className="mt-2 text-xs text-text-secondary">
                {localize('com_ui_admin_retention_allowed_range', {
                  min: retentionConstraints.minRetentionDays,
                  max: retentionConstraints.maxRetentionDays,
                })}
              </div>
              <button
                type="button"
                onClick={purgeRetention}
                disabled={
                  purgeRetentionMutation.isLoading ||
                  retentionQuery.isLoading ||
                  !retentionQuery.data
                }
                className="mt-3 rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {localize('com_ui_admin_retention_purge_now')}
              </button>
              {retentionMessage ? (
                <div className="mt-3 text-xs text-text-secondary">{retentionMessage}</div>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-border-light bg-surface-secondary p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <div className="mb-1 text-xs text-text-secondary">{localize('com_ui_search')}</div>
                <Input
                  value={deeplSearch}
                  onChange={(event) => {
                    setDeeplSearch(event.target.value);
                    setDeeplPage(1);
                  }}
                  placeholder={localize('com_ui_admin_deepl_search_placeholder')}
                  className="w-full"
                />
              </div>
              <div className="min-w-[180px]">
                <div className="mb-1 text-xs text-text-secondary">
                  {localize('com_ui_admin_status')}
                </div>
                <select
                  value={deeplStatus}
                  onChange={(event) => {
                    setDeeplStatus(event.target.value);
                    setDeeplPage(1);
                  }}
                  className="h-10 w-full rounded-md border border-border-light bg-transparent px-3 text-sm"
                >
                  <option value="">{localize('com_ui_all')}</option>
                  <option value="uploaded">{localize('com_ui_admin_deepl_status_uploaded')}</option>
                  <option value="translating">
                    {localize('com_ui_admin_deepl_status_translating')}
                  </option>
                  <option value="done">{localize('com_ui_admin_deepl_status_done')}</option>
                  <option value="downloaded">
                    {localize('com_ui_admin_deepl_status_downloaded')}
                  </option>
                  <option value="error">{localize('com_ui_error')}</option>
                </select>
              </div>
            </div>
            <div className="mt-2 text-xs text-text-secondary">
              {localize('com_ui_admin_total_jobs', {
                total: deeplQuery.data?.pagination.totalJobs ?? 0,
              })}
            </div>
          </section>
        )}

        {activeQuery.isLoading && !activeQuery.data ? (
          <div className="flex items-center justify-center rounded-xl border border-border-light bg-surface-secondary p-8">
            <Spinner className="size-8" />
          </div>
        ) : null}

        {activeQuery.isError ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {getErrorMessage(activeQuery.error, localize('com_ui_admin_load_analytics_error'))}
          </div>
        ) : null}

        {!activeQuery.isLoading && !activeQuery.isError && tab === 'users' ? (
          <div className="overflow-hidden rounded-xl border border-border-light">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface-tertiary text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_ui_admin_username')}
                  </th>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_auth_email')}
                  </th>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_ui_prompts')}
                  </th>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_ui_admin_upload_files')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(usersQuery.data?.users ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-border-light">
                    <td className="px-4 py-3 text-text-primary">{row.username}</td>
                    <td className="px-4 py-3 text-text-secondary">{row.email ?? '-'}</td>
                    <td className="px-4 py-3 text-text-secondary">{row.prompts}</td>
                    <td className="px-4 py-3 text-text-secondary">{row.uploadFiles}</td>
                  </tr>
                ))}
                {(usersQuery.data?.users.length ?? 0) === 0 ? (
                  <tr className="border-t border-border-light">
                    <td colSpan={4} className="px-4 py-4 text-center text-text-secondary">
                      {localize('com_ui_admin_users_no_results')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!activeQuery.isLoading && !activeQuery.isError && tab === 'deepl' ? (
          <div className="overflow-hidden rounded-xl border border-border-light">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface-tertiary text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_ui_created')}
                  </th>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_ui_user')}
                  </th>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_ui_admin_file')}
                  </th>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_ui_admin_languages')}
                  </th>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_ui_admin_status')}
                  </th>
                  <th className="px-4 py-3 font-medium text-text-primary">
                    {localize('com_ui_error')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(deeplQuery.data?.jobs ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-border-light">
                    <td className="px-4 py-3 text-text-primary">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.userEmail ?? row.userId ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.file ? `${row.file} (${formatBytes(row.sizeBytes)})` : '-'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.source ?? '-'} {'->'} {row.target ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{row.status ?? '-'}</td>
                    <td className="px-4 py-3 text-text-secondary">{row.error ?? '-'}</td>
                  </tr>
                ))}
                {(deeplQuery.data?.jobs.length ?? 0) === 0 ? (
                  <tr className="border-t border-border-light">
                    <td colSpan={6} className="px-4 py-4 text-center text-text-secondary">
                      {localize('com_ui_admin_no_deepl_jobs')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!activeQuery.isLoading && !activeQuery.isError ? (
          <div className="flex items-center justify-between rounded-xl border border-border-light bg-surface-secondary p-4">
            <div className="text-sm text-text-secondary">
              {localize('com_ui_admin_page_summary', {
                page:
                  tab === 'users'
                    ? (usersQuery.data?.pagination.page ?? 1)
                    : (deeplQuery.data?.pagination.page ?? 1),
                totalPages:
                  tab === 'users'
                    ? (usersQuery.data?.pagination.totalPages ?? 1)
                    : (deeplQuery.data?.pagination.totalPages ?? 1),
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!hasPrev}
                onClick={() =>
                  tab === 'users'
                    ? setPage((currentPage) => Math.max(currentPage - 1, 1))
                    : setDeeplPage((currentPage) => Math.max(currentPage - 1, 1))
                }
                className="rounded-md border border-border-light px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {localize('com_ui_prev')}
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={() =>
                  tab === 'users'
                    ? setPage((currentPage) => currentPage + 1)
                    : setDeeplPage((currentPage) => currentPage + 1)
                }
                className="rounded-md border border-border-light px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {localize('com_ui_next')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
