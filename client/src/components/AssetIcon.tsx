import { cn } from '~/utils';

type AssetIconProps = {
  src: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
};

export default function AssetIcon({
  src,
  alt = '',
  className = '',
  imageClassName = '',
}: AssetIconProps) {
  return (
    <span
      aria-hidden={alt.length === 0}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg',
        className,
      )}
    >
      <img src={src} alt={alt} className={cn('h-full w-full object-contain', imageClassName)} />
    </span>
  );
}
