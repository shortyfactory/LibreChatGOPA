import { useState } from 'react';
import { GearIcon } from '@librechat/client';
import type { Action } from 'librechat-data-provider';
import { cn } from '~/utils';

export default function Action({
  action,
  onClick,
  readOnly = false,
}: {
  action: Action;
  onClick: () => void;
  readOnly?: boolean;
}) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? -1 : 0}
      onClick={readOnly ? undefined : onClick}
      onKeyDown={(e) => {
        if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
          onClick();
        }
      }}
      className={cn(
        'group flex w-full rounded-lg border border-border-medium text-sm focus:outline-none',
        readOnly ? '' : 'hover:cursor-pointer focus:ring-2 focus:ring-text-primary',
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      aria-label={`Action for ${action.metadata.domain}`}
    >
      <div
        className="h-9 grow overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2"
        style={{ wordBreak: 'break-all' }}
      >
        {action.metadata.domain}
      </div>
      <div
        className={cn(
          'h-9 w-9 min-w-9 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-tertiary focus:outline-none focus:ring-2 focus:ring-text-primary group-focus:flex',
          isHovering && !readOnly ? 'flex' : 'hidden',
        )}
        aria-label="Settings"
      >
        <GearIcon className="icon-sm" aria-hidden="true" />
      </div>
    </div>
  );
}
