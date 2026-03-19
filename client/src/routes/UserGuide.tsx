import { Link } from 'react-router-dom';
import {
  ArrowUp,
  AtSign,
  BookOpen,
  Bot,
  Languages,
  MessageSquare,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import SidebarReopenButton from '~/components/Nav/SidebarReopenButton';
import PageHeaderCard from '~/components/PageHeaderCard';
import { useLocalize } from '~/hooks';

export default function UserGuide() {
  const localize = useLocalize();

  return (
    <div className="h-full overflow-auto p-6">
      <SidebarReopenButton />
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeaderCard
          iconSrc="/assets/user_guide_32.png"
          title={localize('com_ui_gopa_user_guide')}
          description={localize('com_ui_gopa_guide_description')}
        />

        <section className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-100">
          <div className="font-medium">{localize('com_ui_gopa_guide_reminder_title')}</div>
          <p className="mt-2 leading-6">{localize('com_ui_gopa_guide_reminder_body')}</p>
        </section>

        <section className="rounded-2xl border border-border-light bg-surface-secondary p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-text-primary">
              {localize('com_ui_gopa_guide_quick_access_title')}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {localize('com_ui_gopa_guide_quick_access_description')}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Link
              to="/c/new"
              className="rounded-2xl border border-border-light bg-surface-primary p-4 transition-colors hover:bg-surface-hover"
            >
              <MessageSquare className="mb-3 size-5 text-text-secondary" />
              <div className="font-medium text-text-primary">{localize('com_ui_new_chat')}</div>
              <div className="mt-1 text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_quick_new_chat')}
              </div>
            </Link>
            <Link
              to="/d/prompts"
              className="rounded-2xl border border-border-light bg-surface-primary p-4 transition-colors hover:bg-surface-hover"
            >
              <BookOpen className="mb-3 size-5 text-text-secondary" />
              <div className="font-medium text-text-primary">{localize('com_ui_prompts')}</div>
              <div className="mt-1 text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_quick_prompts')}
              </div>
            </Link>
            <Link
              to="/sdg"
              className="rounded-2xl border border-border-light bg-surface-primary p-4 transition-colors hover:bg-surface-hover"
            >
              <Sparkles className="mb-3 size-5 text-text-secondary" />
              <div className="font-medium text-text-primary">
                {localize('com_ui_gopa_sdg_title')}
              </div>
              <div className="mt-1 text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_quick_sdg')}
              </div>
            </Link>
            <Link
              to="/deepl"
              className="rounded-2xl border border-border-light bg-surface-primary p-4 transition-colors hover:bg-surface-hover"
            >
              <Languages className="mb-3 size-5 text-text-secondary" />
              <div className="font-medium text-text-primary">
                {localize('com_ui_gopa_deepl_title')}
              </div>
              <div className="mt-1 text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_quick_deepl')}
              </div>
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-border-light bg-surface-secondary p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-text-primary">
              {localize('com_ui_gopa_guide_formats_title')}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {localize('com_ui_gopa_guide_formats_description')}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
              <div className="mb-3 flex items-center gap-2 text-text-primary">
                <BookOpen className="size-5 text-text-secondary" />
                <h3 className="font-medium">{localize('com_ui_prompt')}</h3>
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_format_prompt')}
              </p>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
              <div className="mb-3 flex items-center gap-2 text-text-primary">
                <Paperclip className="size-5 text-text-secondary" />
                <h3 className="font-medium">{localize('com_ui_gopa_guide_attached_file_title')}</h3>
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_format_file')}
              </p>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
              <div className="mb-3 flex items-center gap-2 text-text-primary">
                <Bot className="size-5 text-text-secondary" />
                <h3 className="font-medium">{localize('com_ui_agent')}</h3>
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_format_agent')}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border-light bg-surface-secondary p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-text-primary">
              {localize('com_ui_gopa_guide_workflow_title')}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {localize('com_ui_gopa_guide_workflow_description')}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
              <div className="mb-3 font-medium text-text-primary">
                {localize('com_ui_gopa_guide_step_context_title')}
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_step_context_body')}
              </p>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
              <div className="mb-3 font-medium text-text-primary">
                {localize('com_ui_gopa_guide_step_file_title')}
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_step_file_body')}
              </p>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
              <div className="mb-3 font-medium text-text-primary">
                {localize('com_ui_gopa_guide_step_attach_title')}
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_step_attach_body')}
              </p>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
              <div className="mb-3 font-medium text-text-primary">
                {localize('com_ui_gopa_guide_step_request_title')}
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_step_request_body')}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border-light bg-surface-secondary p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-text-primary">
              {localize('com_ui_gopa_guide_shortcuts_title')}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {localize('com_ui_gopa_guide_shortcuts_description')}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
              <div className="mb-3 flex items-center gap-2 text-text-primary">
                <AtSign className="size-5 text-text-secondary" />
                <h3 className="font-medium">{localize('com_ui_gopa_guide_shortcut_at_title')}</h3>
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_shortcut_at_body')}
              </p>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
              <div className="mb-3 flex items-center gap-2 text-text-primary">
                <ArrowUp className="size-5 text-text-secondary" />
                <h3 className="font-medium">
                  {localize('com_ui_gopa_guide_shortcut_arrow_title')}
                </h3>
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_ui_gopa_guide_shortcut_arrow_body')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
