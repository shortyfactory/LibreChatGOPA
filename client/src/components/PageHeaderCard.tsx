import type { ReactNode } from 'react';
import AssetIcon from './AssetIcon';
import { cn } from '~/utils';

type PageHeaderCardProps = {
  title: string;
  description: string;
  iconSrc?: string;
  children?: ReactNode;
  className?: string;
};

export default function PageHeaderCard({
  title,
  description,
  iconSrc,
  children,
  className = '',
}: PageHeaderCardProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border-light bg-gradient-to-br from-surface-secondary via-surface-primary to-surface-secondary p-6 shadow-sm',
        className,
      )}
    >
      <div className="bg-surface-hover/70 absolute -right-14 top-0 h-36 w-36 rounded-full blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          {iconSrc ? (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border-medium bg-surface-primary shadow-sm">
              <AssetIcon
                src={iconSrc}
                className="h-10 w-10 rounded-xl bg-transparent shadow-none"
              />
            </div>
          ) : null}
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
          </div>
        </div>
        {children ? <div className="lg:min-w-[220px] lg:self-center">{children}</div> : null}
      </div>
    </section>
  );
}
