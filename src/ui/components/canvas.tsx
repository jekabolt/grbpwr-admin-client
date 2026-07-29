import { cn } from 'lib/utility';
/**
 * A garment drawing with numbered/lettered markers on it. Shared by the sketch
 * gallery, the construction assembly map, the piece diagram and the labels garment
 * map — four screens that would otherwise each re-implement positioned dots.
 *
 * Coordinates are percentages of the frame, matching how callouts are stored.
 */
export function Canvas({
  src,
  alt,
  aspect = '3/4',
  children,
  className,
}: {
  src?: string;
  alt?: string;
  aspect?: '3/4' | '4/3';
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      style={
        src
          ? undefined
          : {
              backgroundImage:
                'repeating-linear-gradient(45deg,#f7f7f7,#f7f7f7 7px,#f0f0f0 7px,#f0f0f0 14px)',
            }
      }
      className={cn(
        'relative border border-borderColor bg-bgColor',
        aspect === '3/4' ? 'aspect-[3/4]' : 'aspect-[4/3]',
        className,
      )}
    >
      {src && <img src={src} alt={alt ?? ''} className='h-full w-full object-contain' />}
      {children}
    </div>
  );
}

export function Pin({
  x,
  y,
  label,
  highlighted,
  onClick,
  onMouseEnter,
  onMouseLeave,
  title,
}: {
  /** 0–100, percent of the frame width. */
  x: number;
  /** 0–100, percent of the frame height. */
  y: number;
  label: React.ReactNode;
  highlighted?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  title?: string;
}) {
  const Component = onClick ? 'button' : 'span';
  return (
    <Component
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={title}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={[
        'absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-nano leading-none tabular-nums',
        highlighted ? 'bg-error text-bgColor' : 'bg-textColor text-bgColor',
      ].join(' ')}
    >
      {label}
    </Component>
  );
}
