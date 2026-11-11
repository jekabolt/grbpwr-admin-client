import type { SyntheticEvent } from 'react';

import { cn } from 'lib/utility';
import { Iconoir } from '../icons/iconoir';
import { initials } from './avatar';

/**
 * THE PEOPLE OF A TILE (owner: «ховер и клик на круг с Assignee сдвинет остальной контент правее и
 * плавно расправит вниз всех участников, в самом верху оставив плюсик чтобы вписать нового»).
 *
 * Closed: the people as ink circles overlapping, a grey `+` circle over the last one. Open: the `+`
 * circle stays at the top and everybody unfolds DOWNWARD under it, one circle after another (soft
 * ease, each a step later). The unfolded column hangs under the trigger and takes no room by
 * itself — the holder shifts its content to the right by `PeopleUnfold.shift(size)` and keeps
 * `PeopleUnfold.height(count, size)` free under the trigger. `+` calls `onAdd`; a circle calls
 * `onPerson` (take the person off, open their tasks).
 */
export function PeopleUnfold({
  names,
  open,
  onOpenChange,
  onAdd,
  onPerson,
  size = 20,
  disabled,
  plus = !disabled,
  className,
}: {
  names: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `+` pressed while open. */
  onAdd?: () => void;
  onPerson?: (name: string) => void;
  /** Circle diameter, px: 20 on a board tile, 30 on a wide one. */
  size?: number;
  disabled?: boolean;
  /** Show the grey `+` circle (by default: whenever it is not disabled). */
  plus?: boolean;
  className?: string;
}) {
  const people = names.filter((n) => !!n.trim());
  const lap = Math.round(size * 0.4);
  const circle = { width: size, height: size, flex: `0 0 ${size}px` };
  const face =
    'inline-flex items-center justify-center rounded-full bg-ink text-nano leading-none text-bgColor';
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center', className)}
      onPointerDown={stop}
      onDoubleClick={stop}
      onKeyDown={stop}
    >
      <button
        type='button'
        disabled={disabled}
        aria-expanded={open}
        aria-label={people.length ? `assignees: ${people.join(', ')}` : 'assignees: nobody'}
        title={people.join(', ') || 'unassigned'}
        onClick={(e) => {
          e.stopPropagation();
          if (open && onAdd) onAdd();
          else onOpenChange(!open);
        }}
        className='inline-flex cursor-pointer items-center outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default'
      >
        {people.slice(0, 2).map((name, i) => (
          <span
            key={`${name}-${i}`}
            style={{
              ...circle,
              marginLeft: i > 0 ? -lap : 0,
              // Folding away: the faces leave the row for the column under it.
              ...(open ? { width: 0, flexBasis: 0, marginLeft: 0, opacity: 0 } : null),
            }}
            className={cn(
              face,
              'overflow-hidden ring-1 ring-tileFill transition-[width,flex-basis,margin,opacity] duration-700 ease-soft motion-reduce:transition-none',
            )}
          >
            {initials(name)}
          </span>
        ))}
        {plus && (
          <span
            style={{ ...circle, marginLeft: !open && people.length ? -lap : 0 }}
            className='inline-flex items-center justify-center rounded-full bg-pinOff text-labelDark ring-1 ring-tileFill transition-[margin] duration-700 ease-soft motion-reduce:transition-none'
          >
            <Iconoir name='plus' strokeWidth={1.6} className='size-1/2' />
          </span>
        )}
      </button>
      <span
        aria-hidden={!open}
        inert={!open}
        className='absolute top-full left-0 z-10 flex flex-col pt-1'
        style={{ gap: 4 }}
      >
        {people.map((name, i) => (
          <button
            key={`${name}-${i}`}
            type='button'
            title={name}
            aria-label={name}
            disabled={!onPerson}
            onClick={(e) => {
              e.stopPropagation();
              onPerson?.(name);
            }}
            style={{ ...circle, transitionDelay: open ? `${i * 60}ms` : '0ms' }}
            className={cn(
              face,
              'transition-[opacity,transform] duration-700 ease-soft motion-reduce:transition-none',
              onPerson && 'cursor-pointer hover:bg-labelDark',
              open ? 'opacity-100' : 'pointer-events-none -translate-y-3 opacity-0',
            )}
          >
            {initials(name)}
          </button>
        ))}
      </span>
    </span>
  );
}

/** How far the holder shifts its content while the people are unfolded, px. */
PeopleUnfold.shift = (size = 20) => size + 12;
/** The room the unfolded column needs under the trigger, px. */
PeopleUnfold.height = (count: number, size = 20) => (count > 0 ? count * (size + 4) + 4 : 0);
