import { cn } from 'lib/utility';
/**
 * The striped "nothing here yet" surface. Every image slot and every unset tile uses
 * it — an empty white box reads as a bug, a striped one reads as a slot.
 */
export function Placeholder({
  label,
  aspect = 'auto',
  tone = 'default',
  dashed,
  className,
  style,
  children,
}: {
  label?: React.ReactNode;
  aspect?: 'auto' | 'square' | '3/4' | '4/3';
  tone?: 'default' | 'error';
  dashed?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const aspectClass =
    aspect === 'square'
      ? 'aspect-square'
      : aspect === '3/4'
        ? 'aspect-[3/4]'
        : aspect === '4/3'
          ? 'aspect-[4/3]'
          : '';
  return (
    <div
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg,#f4f4f4,#f4f4f4 6px,#ececec 6px,#ececec 12px)',
        ...style,
      }}
      className={cn(
        'flex items-center justify-center border text-micro uppercase tracking-label',
        aspectClass,
        dashed ? 'border-dashed' : '',
        tone === 'error' ? 'border-error text-error' : 'border-borderColor text-textInactiveColor',
        className,
      )}
    >
      {children ?? label}
    </div>
  );
}
