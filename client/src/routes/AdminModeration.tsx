import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Spinner } from '@librechat/client';
import { SystemRoles } from 'librechat-data-provider';
import { useGetAdminModerationQuery } from '~/data-provider';
import SidebarReopenButton from '~/components/Nav/SidebarReopenButton';
import PageHeaderCard from '~/components/PageHeaderCard';
import { useAuthContext, useLocalize } from '~/hooks';

const formatDateTime = (value?: string | number) => {
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

export default function AdminModeration() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  const moderationQuery = useGetAdminModerationQuery(
    { limit: 200 },
    {
      enabled: isAdmin,
    },
  );

  const formatDuration = (milliseconds?: number) => {
    if (!milliseconds || milliseconds <= 0) {
      return localize('com_ui_admin_expired');
    }

    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return localize('com_ui_admin_duration_hours_minutes', { hours, minutes });
    }

    if (minutes > 0) {
      return localize('com_ui_admin_duration_minutes_seconds', { minutes, seconds });
    }

    return localize('com_ui_admin_duration_seconds', { seconds });
  };

  const formatSessionWindow = (milliseconds?: number) => {
    if (!milliseconds || milliseconds <= 0) {
      return '-';
    }

    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return localize('com_ui_admin_duration_days_hours', { days, hours });
    }

    if (hours > 0) {
      return localize('com_ui_admin_duration_hours_minutes', { hours, minutes });
    }

    if (minutes > 0) {
      return localize('com_ui_admin_duration_minutes_seconds', { minutes, seconds });
    }

    return localize('com_ui_admin_duration_seconds', { seconds });
  };

  const formatConfiguredValue = (value: boolean | number | string) => {
    if (typeof value === 'boolean') {
      return value ? localize('com_ui_yes') : localize('com_ui_no');
    }

    return String(value);
  };

  const formatAuthMode = () => {
    const mode = moderationQuery.data?.authContext.mode ?? 'unknown';
    const provider = moderationQuery.data?.authContext.provider ?? '';

    if (mode === 'openid-only') {
      return provider
        ? localize('com_ui_admin_auth_mode_openid_provider', { provider })
        : localize('com_ui_admin_auth_mode_openid_only');
    }

    if (mode === 'hybrid') {
      return provider
        ? localize('com_ui_admin_auth_mode_hybrid_provider', { provider })
        : localize('com_ui_admin_auth_mode_hybrid');
    }

    if (mode === 'local-only') {
      return localize('com_ui_admin_auth_mode_local_only');
    }

    return localize('com_ui_admin_auth_mode_unknown');
  };

  const activeBans = useMemo(
    () => (moderationQuery.data?.bans ?? []).filter((ban) => ban.isActive === true).length,
    [moderationQuery.data],
  );
  const activeLimits = useMemo(
    () =>
      (moderationQuery.data?.configuredLimits ?? []).filter(
        (row) => (row.relevance ?? 'active') === 'active',
      ),
    [moderationQuery.data],
  );
  const conditionalLimits = useMemo(
    () =>
      (moderationQuery.data?.configuredLimits ?? []).filter(
        (row) => (row.relevance ?? 'active') === 'conditional',
      ),
    [moderationQuery.data],
  );
  const inactiveLimits = useMemo(
    () =>
      (moderationQuery.data?.configuredLimits ?? []).filter((row) => row.relevance === 'inactive'),
    [moderationQuery.data],
  );

  const loading = moderationQuery.isLoading && !moderationQuery.data;
  const errorMessage = moderationQuery.isError
    ? getErrorMessage(moderationQuery.error, localize('com_ui_admin_load_moderation_error'))
    : null;

  if (!isAdmin) {
    return <Navigate to="/c/new" replace={true} />;
  }

  return (
    <div className="h-full overflow-auto p-6">
      <SidebarReopenButton />
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeaderCard
          iconSrc="/assets/moderation_32.png"
          title={localize('com_ui_admin_moderation')}
          description={localize('com_ui_admin_moderation_description')}
        />

        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_admin_violations')}
            </div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">
              {moderationQuery.data?.counts.violations ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_admin_bans')}
            </div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">
              {moderationQuery.data?.counts.bans ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_admin_active_bans')}
            </div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{activeBans}</div>
          </div>
          <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_admin_generated_at')}
            </div>
            <div className="mt-1 text-sm text-text-primary">
              {formatDateTime(moderationQuery.data?.generatedAt)}
            </div>
          </div>
        </section>

        {!loading && !errorMessage ? (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
              <div className="text-xs uppercase tracking-wide text-text-secondary">
                {localize('com_ui_admin_auth_mode')}
              </div>
              <div className="mt-1 text-sm font-medium text-text-primary">{formatAuthMode()}</div>
              {moderationQuery.data?.authContext.issuer ? (
                <div className="mt-1 break-all text-xs text-text-secondary">
                  {localize('com_ui_admin_issuer')}: {moderationQuery.data.authContext.issuer}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
              <div className="text-xs uppercase tracking-wide text-text-secondary">
                {localize('com_ui_admin_session_timeout')}
              </div>
              <div className="mt-1 text-sm font-medium text-text-primary">
                {formatSessionWindow(moderationQuery.data?.authSessionConfig.sessionExpiryMs)}
              </div>
              <div className="mt-1 font-mono text-xs text-text-secondary">
                {moderationQuery.data?.authSessionConfig.sessionExpiryRaw ?? '-'}
              </div>
            </div>

            <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
              <div className="text-xs uppercase tracking-wide text-text-secondary">
                {localize('com_ui_admin_refresh_token_timeout')}
              </div>
              <div className="mt-1 text-sm font-medium text-text-primary">
                {formatSessionWindow(moderationQuery.data?.authSessionConfig.refreshTokenExpiryMs)}
              </div>
              <div className="mt-1 font-mono text-xs text-text-secondary">
                {moderationQuery.data?.authSessionConfig.refreshTokenExpiryRaw ?? '-'}
              </div>
            </div>
          </section>
        ) : null}

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
              <div className="border-b border-border-light bg-surface-tertiary px-4 py-3 text-sm font-medium text-text-primary">
                {localize('com_ui_admin_active_limits')}
              </div>
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-tertiary text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_area')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_values')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_env_keys')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_reason')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeLimits.map((row) => (
                    <tr key={row.key} className="border-t border-border-light">
                      <td className="px-4 py-3 text-text-primary">{row.label}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {Object.entries(row.values)
                          .map(([key, value]) => `${key}: ${formatConfiguredValue(value)}`)
                          .join(' | ')}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {row.env.length > 0 ? row.env.join(', ') : '-'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.reason ?? '-'}</td>
                    </tr>
                  ))}
                  {activeLimits.length === 0 ? (
                    <tr className="border-t border-border-light">
                      <td colSpan={4} className="px-4 py-4 text-center text-text-secondary">
                        {localize('com_ui_admin_no_active_limits')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-border-light">
              <div className="border-b border-border-light bg-surface-tertiary px-4 py-3 text-sm font-medium text-text-primary">
                {localize('com_ui_admin_conditional_limits')}
              </div>
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-tertiary text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_area')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_values')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_env_keys')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_reason')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {conditionalLimits.map((row) => (
                    <tr key={row.key} className="border-t border-border-light">
                      <td className="px-4 py-3 text-text-primary">{row.label}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {Object.entries(row.values)
                          .map(([key, value]) => `${key}: ${formatConfiguredValue(value)}`)
                          .join(' | ')}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {row.env.length > 0 ? row.env.join(', ') : '-'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.reason ?? '-'}</td>
                    </tr>
                  ))}
                  {conditionalLimits.length === 0 ? (
                    <tr className="border-t border-border-light">
                      <td colSpan={4} className="px-4 py-4 text-center text-text-secondary">
                        {localize('com_ui_admin_no_conditional_limits')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-border-light">
              <div className="border-b border-border-light bg-surface-tertiary px-4 py-3 text-sm font-medium text-text-primary">
                {localize('com_ui_admin_inactive_limits')}
              </div>
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-tertiary text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_area')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_values')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_env_keys')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_reason')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveLimits.map((row) => (
                    <tr key={row.key} className="border-t border-border-light">
                      <td className="px-4 py-3 text-text-primary">{row.label}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {Object.entries(row.values)
                          .map(([key, value]) => `${key}: ${formatConfiguredValue(value)}`)
                          .join(' | ')}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {row.env.length > 0 ? row.env.join(', ') : '-'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.reason ?? '-'}</td>
                    </tr>
                  ))}
                  {inactiveLimits.length === 0 ? (
                    <tr className="border-t border-border-light">
                      <td colSpan={4} className="px-4 py-4 text-center text-text-secondary">
                        {localize('com_ui_admin_no_inactive_limits')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-border-light">
              <div className="border-b border-border-light bg-surface-tertiary px-4 py-3 text-sm font-medium text-text-primary">
                {localize('com_ui_admin_recent_violations')}
              </div>
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-tertiary text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_date')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_type')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_count')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_limiter')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_window')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_key')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(moderationQuery.data?.violations ?? []).map((row, index) => (
                    <tr
                      key={`${row.key}-${row.date}-${index}`}
                      className="border-t border-border-light"
                    >
                      <td className="px-4 py-3 text-text-primary">{formatDateTime(row.date)}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.type ?? '-'}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.violation_count ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.limiter ?? '-'}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.windowInMinutes
                          ? localize('com_ui_admin_window_minutes', { count: row.windowInMinutes })
                          : '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">{row.key}</td>
                    </tr>
                  ))}
                  {(moderationQuery.data?.violations.length ?? 0) === 0 ? (
                    <tr className="border-t border-border-light">
                      <td colSpan={6} className="px-4 py-4 text-center text-text-secondary">
                        {localize('com_ui_admin_no_violations')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-border-light">
              <div className="border-b border-border-light bg-surface-tertiary px-4 py-3 text-sm font-medium text-text-primary">
                {localize('com_ui_admin_recent_bans')}
              </div>
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-tertiary text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_status')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_type')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_user')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_count')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_expires')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_time_left')}
                    </th>
                    <th className="px-4 py-3 font-medium text-text-primary">
                      {localize('com_ui_admin_key')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(moderationQuery.data?.bans ?? []).map((row, index) => (
                    <tr
                      key={`${row.key}-${row.expiresAt}-${index}`}
                      className="border-t border-border-light"
                    >
                      <td className="px-4 py-3 text-text-primary">
                        {row.isActive
                          ? localize('com_ui_active')
                          : localize('com_ui_admin_expired')}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.type ?? '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {row.user_id ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.violation_count ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDateTime(row.expiresAt)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDuration(row.timeLeftMs)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">{row.key}</td>
                    </tr>
                  ))}
                  {(moderationQuery.data?.bans.length ?? 0) === 0 ? (
                    <tr className="border-t border-border-light">
                      <td colSpan={7} className="px-4 py-4 text-center text-text-secondary">
                        {localize('com_ui_admin_no_bans')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
