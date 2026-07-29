import { cn } from 'lib/utility';

/**
 * The reference's `.pin` at person scale: a filled ink circle carrying two initials,
 * or a dashed empty circle when nobody owns the thing.
 *
 * Shared by the fulfilment board (assignee), the fulfilment filter row, the task
 * card and the task detail rail — before this existed each of them hand-rolled its
 * own circle and they had drifted to three different sizes.
 *
 * The circle is the one place a border radius is legitimate in this design system;
 * `rounded-full` here is not a stray radius.
 */

/** First letters of the first two words, Cyrillic-safe. Falls back to the first two chars. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = 20,
  title,
  className,
}: {
  /** Empty / undefined renders the unassigned state. */
  name?: string;
  size?: number;
  title?: string;
  className?: string;
}) {
  const assigned = !!name?.trim();
  return (
    <span
      title={title ?? (assigned ? name : 'unassigned')}
      style={{ width: size, height: size, flex: `0 0 ${size}px` }}
      className={cn(
        'inline-flex items-center justify-center rounded-full text-nano leading-none',
        assigned
          ? 'bg-textColor text-bgColor'
          : 'border border-dashed border-borderColor text-labelColor',
        className,
      )}
    >
      {assigned ? initials(name!) : '?'}
    </span>
  );
}

/** A row of avatars used as a filter — each face carries the count of its pile. */
export function AvatarPicker({
  people,
  selected,
  onSelect,
  className,
}: {
  people: { name: string; count: number }[];
  /** `''` selects the unassigned pile; `undefined` means no filter. */
  selected?: string;
  onSelect: (name: string | undefined) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {people.map((p) => (
        <button
          key={p.name}
          type='button'
          aria-pressed={selected === p.name}
          onClick={() => onSelect(selected === p.name ? undefined : p.name)}
          className={cn(
            'inline-flex items-center gap-1 text-micro uppercase tracking-pill',
            selected === p.name ? 'text-textColor' : 'text-labelColor hover:text-textColor',
          )}
        >
          <Avatar name={p.name} className={selected === p.name ? 'ring-1 ring-textColor' : ''} />
          {p.count}
        </button>
      ))}
    </div>
  );
}
