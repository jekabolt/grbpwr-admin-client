import { type ReactNode, type Ref, type SyntheticEvent } from 'react';

import { cn } from 'lib/utility';

const SOFT = 'duration-700 ease-soft motion-reduce:transition-none';
/** A word that is pressed keeps its hover look: no filled container, no nudge. */
export const QUIET_PRESS = 'press:translate-y-0 press:bg-transparent';

const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * A part that folds away: height and fade on the soft ease, both ways (the reverse of opening is
 * the same motion backwards). Folded, it is inert and hidden from assistive technology.
 */
export function Fold({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity]',
        SOFT,
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className,
      )}
    >
      <div className='min-h-0 min-w-0 overflow-hidden'>{children}</div>
    </div>
  );
}

export type SelectWord = { key: string; label: ReactNode; onClick: () => void };

/**
 * THE WORDS OF A SELECTED TILE — «Edit», «Archive», «Delete» at the right, above the tile. Grey by
 * default; under the pointer and pressed a word turns ink and takes brackets — `[Edit]`. They come
 * in one after another while `shown`, and leave together.
 */
export function SelectWords({
  shown,
  items,
  className,
}: {
  shown: boolean;
  items: readonly SelectWord[];
  className?: string;
}) {
  const bracket =
    'opacity-0 transition-opacity duration-500 ease-soft group-hover/act:opacity-100 group-active/act:opacity-100';
  return (
    <div className={cn('flex h-7 items-center justify-end gap-3 pr-1', className)}>
      {items.map((item, i) => (
        <button
          key={item.key}
          type='button'
          onPointerDown={stop}
          onDoubleClick={stop}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
          }}
          style={{ transitionDelay: shown ? `${40 + i * 80}ms` : '0ms' }}
          className={cn(
            'group/act h-7 cursor-pointer text-textBaseSize whitespace-nowrap text-placeholder transition-[color,opacity,transform] duration-500 ease-soft hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink active:text-ink motion-reduce:transition-none',
            shown ? 'opacity-100' : 'translate-y-2 opacity-0',
          )}
        >
          <span aria-hidden='true' className={bracket}>
            [
          </span>
          {item.label}
          <span aria-hidden='true' className={bracket}>
            ]
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * A HEADER WORD — `Department: [ Development ]`: a 10px grey label and a 12px ink value. With
 * `onClick` it is the trigger of an in-place editor: the label turns ink under the pointer and
 * while its editor is open (`active`); nothing is ever filled. `tone`: `alert` — the value in the
 * new red (a deadline close or past); `quiet` — a grey value («Set a Date»). `dim` steps it back
 * while another word's editor is open.
 */
export function MetaWord({
  label,
  value,
  bracket = true,
  tone,
  dim,
  active,
  onClick,
}: {
  label: string;
  value: string;
  bracket?: boolean;
  tone?: 'alert' | 'quiet';
  dim?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const word = bracket ? `[ ${value} ]` : value;
  const colour = dim
    ? 'text-titleOff'
    : tone === 'alert'
      ? 'text-alert'
      : tone === 'quiet' && !active
        ? 'text-placeholder group-hover/meta:text-ink'
        : 'text-ink';
  const text = (
    <>
      <span
        className={cn(
          'text-micro transition-colors duration-500 ease-soft',
          active ? 'text-ink' : 'text-placeholder',
          onClick && 'group-hover/meta:text-ink',
        )}
      >
        {label}:
      </span>
      <span
        className={cn(
          'truncate text-textBaseSize transition-colors duration-500 ease-soft',
          colour,
        )}
      >
        {word}
      </span>
    </>
  );
  if (!onClick)
    return <span className='flex min-w-0 items-baseline gap-1 whitespace-nowrap'>{text}</span>;
  return (
    <button
      type='button'
      aria-expanded={active}
      onPointerDown={stop}
      onDoubleClick={stop}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className='group/meta flex min-w-0 cursor-pointer items-baseline gap-1 whitespace-nowrap focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink'
    >
      {text}
    </button>
  );
}

/**
 * THE TILE SHELL of the Taskboard system: the `tileFill` ground (it steps to `fieldFill` while the
 * tile is selected, held or dragged), the words of the selection above it (`words`, folding in and
 * out), and an ink rule under it. `minimal` tightens the paddings; `flush` drops the bottom padding
 * (tabs standing on the tile's bottom edge). The content — header, title, tabs — is the holder's.
 */
export function TileShell({
  selected,
  lifted,
  minimal,
  words,
  rule = true,
  faded,
  className,
  onClick,
  rootRef,
  children,
}: {
  selected?: boolean;
  /** Pressed and held, or dragged. */
  lifted?: boolean;
  minimal?: boolean;
  words?: readonly SelectWord[];
  /** The ink rule under the tile. */
  rule?: boolean;
  /** An archived / settled tile steps back. */
  faded?: boolean;
  className?: string;
  onClick?: (e: SyntheticEvent) => void;
  rootRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      ref={rootRef}
      data-flip='box'
      className={cn('relative', faded && 'opacity-60')}
      onClick={onClick}
    >
      {words && words.length > 0 && (
        <Fold open={!!selected && !minimal}>
          <SelectWords shown={!!selected} items={words} />
        </Fold>
      )}
      <div
        className={cn(
          'relative px-2 transition-[padding,background-color]',
          SOFT,
          minimal ? 'pt-1.5' : 'pt-2',
          lifted || selected ? 'bg-fieldFill' : 'bg-tileFill',
          className,
        )}
      >
        {children}
      </div>
      {rule && (
        <div
          aria-hidden='true'
          className={cn('border-b border-ink transition-[margin]', SOFT, minimal ? 'my-1' : 'my-2')}
        />
      )}
    </div>
  );
}

/**
 * A TILE'S TITLE: 24px, or 16px in the tile's minimal state (the size eases). `quiet` — grey (a
 * task whose deadline is far); the holder turns it ink on hover / selection by dropping `quiet`.
 */
export function TileTitle({
  minimal,
  quiet,
  className,
  children,
}: {
  minimal?: boolean;
  quiet?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <h3
      data-tile-title
      data-flip='title'
      className={cn(
        'break-words leading-[1.15] transition-[color,font-size]',
        SOFT,
        minimal ? 'line-clamp-2 text-tileSmall' : 'text-head',
        quiet ? 'text-placeholder' : 'text-ink',
        className,
      )}
    >
      {children}
    </h3>
  );
}

/**
 * A COUNT THAT SORTS — `(8)`: pressing it orders what it counts. `state` is where the order
 * stands: `asc` / `desc` show an arrow and an underline, `on` (a two-state count) the underline
 * alone. `tone='alert'` is the red count (overdue).
 */
export function SortCount({
  count,
  state,
  tone,
  onClick,
  label,
  title,
  className,
}: {
  count: ReactNode;
  state?: 'asc' | 'desc' | 'on' | null;
  tone?: 'alert';
  onClick: () => void;
  /** Announced: «8 tasks — sort by deadline». */
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type='button'
      aria-pressed={!!state}
      aria-label={label}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'relative cursor-pointer text-textBaseSize tabular-nums transition-colors duration-500 ease-soft focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink',
        tone === 'alert'
          ? 'text-alert'
          : state
            ? 'text-ink'
            : 'text-placeholder hover:text-ink active:text-ink',
        state && 'underline underline-offset-2',
        className,
      )}
    >
      ({count}){state === 'asc' ? ' ↑' : state === 'desc' ? ' ↓' : ''}
    </button>
  );
}
