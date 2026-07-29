import { cn } from 'lib/utility';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

/**
 * The reference's sticky left column: a bordered panel of grouped rows, each with an
 * optional completion box on the left and a figure or badge on the right.
 *
 *   BOARDS
 *   ✓ development            12
 *     design                  7
 *     marketing              2 !
 *
 * Two screens need exactly this and would otherwise each invent it: the OPEX month
 * list and the tasks board switcher. It is the same primitive the tech-card tab rail
 * uses, generalised — nothing ever hides, and the content column keeps its width.
 */

export function SideRail({
  children,
  width = 150,
  className,
}: {
  children: React.ReactNode;
  /** Rail width in px. The content column takes the rest of the grid. */
  width?: number;
  className?: string;
}) {
  return (
    <div
      style={{ flex: `0 0 ${width}px` }}
      className={cn('self-start border border-borderColor bg-bgColor p-1.5', className)}
    >
      {children}
    </div>
  );
}

/** Wraps the rail and its content column in the two-column grid. */
export function SideRailLayout({
  rail,
  children,
  className,
}: {
  rail: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2.5 lg:flex-row', className)}>
      {rail}
      <div className='min-w-0 flex-1'>{children}</div>
    </div>
  );
}

export function SideRailGroup({ children, flush }: { children: React.ReactNode; flush?: boolean }) {
  return <GroupLabel flush={flush}>{children}</GroupLabel>;
}

export function SideRailItem({
  label,
  count,
  badge,
  done,
  selected,
  onClick,
  className,
}: {
  label: React.ReactNode;
  /** Right-aligned figure. Rendered tabular so a column of them lines up. */
  count?: React.ReactNode;
  /** Takes precedence over `count` — for a Pill carrying a warning. */
  badge?: React.ReactNode;
  /** Shows the reference's 14px completion box. Omit for a rail with no notion of done. */
  done?: boolean;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      aria-pressed={onClick ? selected : undefined}
      className={cn(
        'flex w-full items-center gap-1.5 py-0.5 text-left',
        selected ? 'text-textColor' : 'text-labelColor',
        onClick && 'hover:text-textColor',
        className,
      )}
    >
      {done !== undefined && (
        <span
          aria-hidden
          className={cn(
            'inline-flex h-3.5 w-3.5 flex-none items-center justify-center border border-textColor text-nano leading-none',
            done && 'bg-textColor text-bgColor',
          )}
        >
          {done ? '✓' : ''}
        </span>
      )}
      <span className={cn('min-w-0 flex-1 truncate', selected && 'font-bold')}>{label}</span>
      {badge ??
        (count !== undefined && (
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {count}
          </Text>
        ))}
    </Component>
  );
}
