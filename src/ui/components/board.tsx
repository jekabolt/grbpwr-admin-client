import { cn } from 'lib/utility';
import Text from './text';

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
      <div className='flex flex-1 flex-col gap-1.5 bg-black/[0.02] p-1.5'>{children}</div>
    </div>
  );
}

/** One card in a lane: a bordered white card on the lane's ground, lifting on hover. */
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
        'border border-borderColor bg-bgColor px-2 py-1.5',
        onClick && 'cursor-pointer hover:-translate-y-px hover:shadow-[2px_2px_0_0_var(--color-textColor)]',
        dimmed && 'opacity-60',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The add door's skin: a dashed frame and a quiet label that inks on hover. */
const ADD_DOOR_SKIN =
  'border border-dashed border-borderColor text-micro uppercase tracking-label text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:cursor-not-allowed disabled:text-textInactiveColor disabled:hover:border-borderColor';

const ADD_DOOR_SHAPE = {
  /** Full-width row under a list (or the list's first row when it is empty). */
  row: 'flex w-full items-center bg-bgColor px-2 py-3 text-left',
  /** A square in a row of tiles; size comes from `style` / `className`. */
  tile: 'flex shrink-0 flex-col items-center justify-center gap-1 text-center',
  /** Word-sized, in a header lane next to column names. */
  inline: 'flex w-fit shrink-0 items-center self-start whitespace-nowrap px-2 py-px',
} as const;

export type AddDoorShape = keyof typeof ADD_DOOR_SHAPE;

/**
 * Classes of the add door, for the one element `AddDoor` cannot be — a native `<select>` whose
 * first option is the `+ …` label. `afterRows` = rows stand above: the door keeps 16px of air.
 */
export function addDoorClass(opts?: { shape?: AddDoorShape; afterRows?: boolean }) {
  return cn(ADD_DOOR_SKIN, ADD_DOOR_SHAPE[opts?.shape ?? 'row'], opts?.afterRows && 'mt-4');
}

/**
 * The add door: dashed `+ noun` at the end of a list. It stands 16px below the last row when rows
 * exist (`afterRows`) and is the first row when the list is empty. `children` is the noun; the
 * `+` is drawn here — callers never type it.
 */
export function AddDoor({
  children,
  shape = 'row',
  afterRows,
  className,
  ...props
}: {
  children: React.ReactNode;
  shape?: AddDoorShape;
  afterRows?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  [k: string]: unknown;
}) {
  return (
    <button {...props} type='button' className={cn(addDoorClass({ shape, afterRows }), className)}>
      + {children}
    </button>
  );
}

/** A board column's empty slot; with `onClick` it is the column's add door. */
export function BoardEmpty({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  if (onClick) {
    return (
      <button
        type='button'
        onClick={onClick}
        className={cn(ADD_DOOR_SKIN, 'block w-full px-2 py-3 text-center', className)}
      >
        {children}
      </button>
    );
  }
  return (
    <div
      className={cn(
        'block w-full px-2 py-3 text-center text-micro uppercase tracking-pill text-labelColor',
        className,
      )}
    >
      {children}
    </div>
  );
}
