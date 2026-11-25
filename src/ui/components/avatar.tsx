import { cn } from 'lib/utility';
import { useState } from 'react';

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
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Avatar({
  name,
  src,
  size = 20,
  title,
  className,
}: {
  /** Empty / undefined renders the unassigned state. */
  name?: string;
  /** The person's photo; the initials stay underneath when it is missing or fails to load. */
  src?: string;
  size?: number;
  title?: string;
  className?: string;
}) {
  const assigned = !!name?.trim();
  const [broken, setBroken] = useState('');
  const photo = !!src && broken !== src;
  return (
    <span
      title={title ?? (assigned ? name : 'unassigned')}
      style={{ width: size, height: size, flex: `0 0 ${size}px` }}
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-full text-nano leading-none',
        assigned || photo
          ? 'bg-textColor text-bgColor'
          : 'border border-dashed border-borderColor text-labelColor',
        className,
      )}
    >
      {assigned ? initials(name!) : photo ? '' : '?'}
      {photo && (
        <img
          src={src}
          alt=''
          loading='lazy'
          onError={() => setBroken(src!)}
          className='absolute inset-0 block size-full object-cover'
        />
      )}
    </span>
  );
}

/**
 * A person in words: the name in ink and the quiet `@username` beside it; no name → `@username`;
 * neither (outside teams mode) → `fallback`, the account's handle as it always read.
 * `short` drops the quiet `@username` where a list has no room for it.
 */
export function PersonName({
  name,
  username,
  fallback,
  short,
  className,
}: {
  name?: string;
  /** The effective @username without the `@`; empty outside teams mode. */
  username?: string;
  fallback?: string;
  short?: boolean;
  className?: string;
}) {
  const n = name?.trim() ?? '';
  const u = username?.trim() ?? '';
  return (
    <span className={cn('inline-flex min-w-0 items-baseline gap-1.5', className)}>
      <span className='min-w-0 truncate'>{n || (u ? `@${u}` : fallback || '')}</span>
      {n && u && !short && <span className='min-w-0 truncate text-labelColor'>@{u}</span>}
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
