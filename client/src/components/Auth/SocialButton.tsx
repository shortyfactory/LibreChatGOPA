import React from 'react';

type TSocialButtonProps = {
  id: string;
  enabled: boolean;
  serverDomain: string;
  oauthPath: string;
  Icon: React.ComponentType;
  label: string;
  disabled?: boolean;
};

const SocialButton = ({
  id,
  enabled,
  serverDomain,
  oauthPath,
  Icon,
  label,
  disabled = false,
}: TSocialButtonProps) => {
  if (!enabled) {
    return null;
  }

  const isDisabled = Boolean(disabled);
  const buttonClasses = [
    'flex w-full items-center space-x-3 rounded-2xl border border-border-light bg-surface-primary px-5 py-3 text-text-primary',
    isDisabled
      ? 'cursor-not-allowed opacity-50'
      : 'transition-colors duration-200 hover:bg-surface-tertiary',
  ].join(' ');

  return (
    <div className="mt-2 flex gap-x-2">
      {isDisabled ? (
        <div
          aria-label={`${label}`}
          aria-disabled="true"
          className={buttonClasses}
          role="link"
          data-testid={id}
        >
          <Icon />
          <p>{label}</p>
        </div>
      ) : (
        <a
          aria-label={`${label}`}
          className={buttonClasses}
          href={`${serverDomain}/oauth/${oauthPath}`}
          data-testid={id}
        >
          <Icon />
          <p>{label}</p>
        </a>
      )}
    </div>
  );
};

export default SocialButton;
