import { cn } from 'lib/utility';
import Text from 'ui/components/text';

/**
 * The reference's `.kb` / `.kbcol`: a horizontally scrolling row of bordered columns,
 * each with a surface-filled header carrying a title and a count.
 *
 * Shared by the tasks kanban (5 status lanes, drag-and-drop) and the fulfilment board
 * (the two narrow reference lists beside the to-pack queue). The drag behaviour is
 * NOT here — this is the shell; `@dnd-kit` wiring stays in the tasks screen.
 */

export function Board({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-1', className)}>{children}</div>
  );
}

export function BoardColumn({
  title,
  count,
  action,
  width = 288,
  isDropTarget,
  children,
  className,
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  /** Right side of the header — usually a `+` that seeds a new card into this lane. */
  action?: React.ReactNode;
  width?: number;
  /** Ring highlight while a card hovers over this lane. */
  isDropTarget?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      style={{ flex: `0 0 ${width}px` }}
      className={cn(
        'flex max-w-[85vw] flex-col border border-borderColor bg-bgColor',
        isDropTarget && 'ring-2 ring-inset ring-textColor',
        className,
      )}
    >
      <div className='flex items-center gap-1.5 border-b border-borderColor bg-bgSecondary px-2 py-1'>
        <Text size='micro' variant='uppercase' tracking='group' component='span' className='font-bold'>
          {title}
        </Text>
        {count !== undefined && (
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {count}
          </Text>
        )}
        {action && <div className='ml-auto'>{action}</div>}
      </div>
      <div className='flex-1 bg-black/[0.02]'>{children}</div>
    </div>
  );
}

/** One card in a lane. Hairline-separated, lifts on hover like the reference. */
export function BoardCard({
  onClick,
  children,
  dimmed,
  className,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  /** Archived / inactive cards. */
  dimmed?: boolean;
  className?: string;
}) {
  return (
    <div
      {...(onClick ? { role: 'button', tabIndex: 0, onClick } : {})}
      className={cn(
        'border-b border-hairline bg-bgColor px-2 py-1.5',
        onClick && 'cursor-pointer hover:-translate-y-px hover:shadow-[2px_2px_0_0_var(--color-textColor)]',
        dimmed && 'opacity-60',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The dashed "nothing here" / "+ add" body of an empty lane. */
export function BoardEmpty({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'block w-full px-2 py-3 text-center text-micro uppercase tracking-pill text-labelColor',
        onClick && 'border border-dashed border-borderColor hover:text-textColor',
      )}
    >
      {children}
    </Component>
  );
}
