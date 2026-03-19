import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import AssetIcon from '~/components/AssetIcon';
import { useAuthContext, useLocalize } from '~/hooks';
import NavLink from './NavLink';

type QuickLinksProps = {
  onNavigate?: () => void;
};

export default function QuickLinks({ onNavigate }: QuickLinksProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  const handleNavigate =
    (path: string) =>
    (event: MouseEvent<HTMLButtonElement>): void => {
      if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
        window.open(path, '_blank', 'noopener,noreferrer');
        return;
      }

      navigate(path);
      onNavigate?.();
    };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <section className="rounded-lg border border-border-light bg-surface-secondary p-2">
        <div className="px-2 pb-1 text-xs uppercase tracking-wide text-text-secondary">
          {localize('com_ui_help')}
        </div>
        <div className="flex flex-col gap-1">
          <NavLink
            svg={() => <AssetIcon src="/assets/user_guide_32.png" />}
            text={localize('com_ui_gopa_user_guide')}
            clickHandler={handleNavigate('/guide')}
            className="hover:bg-surface-hover"
          />
        </div>
      </section>

      <section className="rounded-lg border border-border-light bg-surface-secondary p-2">
        <div className="px-2 pb-1 text-xs uppercase tracking-wide text-text-secondary">
          {localize('com_ui_tools')}
        </div>
        <div className="flex flex-col gap-1">
          <NavLink
            svg={() => <AssetIcon src="/assets/sdg_32.png" />}
            text={localize('com_ui_gopa_sdg_title')}
            clickHandler={handleNavigate('/sdg')}
            className="hover:bg-surface-hover"
          />
          <NavLink
            svg={() => <AssetIcon src="/assets/ai_translator_icon.png" />}
            text={localize('com_ui_gopa_deepl_title')}
            clickHandler={handleNavigate('/deepl')}
            className="hover:bg-surface-hover"
          />
        </div>
      </section>

      {isAdmin ? (
        <section className="rounded-lg border border-border-light bg-surface-secondary p-2">
          <div className="px-2 pb-1 text-xs uppercase tracking-wide text-text-secondary">
            {localize('com_ui_admin')}
          </div>
          <div className="flex flex-col gap-1">
            <NavLink
              svg={() => <AssetIcon src="/assets/users_32.png" />}
              text={localize('com_ui_admin_users')}
              clickHandler={handleNavigate('/admin/users')}
              className="hover:bg-surface-hover"
            />
            <NavLink
              svg={() => <AssetIcon src="/assets/moderation_32.png" />}
              text={localize('com_ui_admin_moderation')}
              clickHandler={handleNavigate('/admin/moderation')}
              className="hover:bg-surface-hover"
            />
            <NavLink
              svg={() => <AssetIcon src="/assets/analytics_32.png" />}
              text={localize('com_ui_admin_analytics')}
              clickHandler={handleNavigate('/admin/analytics')}
              className="hover:bg-surface-hover"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
