import { type FocusEvent, type ReactNode, useId, useRef, useState } from 'react';

import { cn } from 'lib/utility';
import { PinToggle } from './pin-toggle';

/**
 * A category of the fill system (Lekalo): a 32px title and its body, no frame. The title is the
 * door: pressing it folds the body away and back (the height eases, the grid-rows 0fr → 1fr trick;
 * none under reduced motion) and touches nothing else. `active` inks the title; every other title
 * stays `titleOff` grey. Hierarchy by size and grey, never weight.
 *
 * Two signals for the caller's accordion: `onActivate` — the title was pressed or the pointer went
 * down inside; `onFocusInside` — focus entered a field of the body (not the title). A folded body is
 * `inert`, so nothing in it can take focus until it opens.
 *
 * Collapsed titles stand on a 55px pitch (32px titles, the caller's 18px gap); an open body ends with
 * its own room before the next title.
 */
export function Category({
  title,
  active = true,
  onActivate,
  onFocusInside,
  open,
  defaultOpen = true,
  onOpenChange,
  action,
  pin,
  instant,
  stickyTop,
  id,
  className,
  children,
}: {
  title: string;
  active?: boolean;
  onActivate?: () => void;
  onFocusInside?: () => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  action?: ReactNode;
  pin?: { pinned: boolean; onToggle: () => void; label?: string };
  /** Fold / open without the height animation (a fold the caller compensates in the same frame). */
  instant?: boolean;
  /**
   * STICKY HEADERS (all right panels). With a value (a CSS length, usually from
   * `categoryStackTops`) the category keeps its title in view while its panel scrolls: folded, the
   * whole 32px row sticks at `stickyTop` (folded titles stack); open, the title row sticks there
   * on white while the body scrolls under it, until the category ends and the next one pushes it.
   */
  stickyTop?: string;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const isOpen = open ?? own;
  const bodyId = useId();
  const door = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    if (open === undefined) setOwn(!isOpen);
    onOpenChange?.(!isOpen);
  };

  return (
    <section
      id={id}
      data-open={isOpen}
      onPointerDownCapture={onActivate}
      onFocusCapture={(e: FocusEvent) => {
        if (e.target !== door.current) onFocusInside?.();
      }}
      style={stickyTop != null && !isOpen ? { top: stickyTop } : undefined}
      className={cn(
        'flex flex-col',
        stickyTop != null && !isOpen && 'sticky z-20 bg-bgColor',
        className,
      )}
    >
      <div
        style={stickyTop != null && isOpen ? { top: stickyTop } : undefined}
        className={cn(
          'flex items-start justify-between gap-3',
          stickyTop != null && isOpen && 'sticky z-10 bg-bgColor pb-2',
        )}
      >
        <div className='flex min-w-0 items-start gap-1.5'>
          <button
            ref={door}
            type='button'
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={toggle}
            className={cn(
              'min-w-0 cursor-pointer text-left text-display leading-[1.15] transition-colors duration-700 ease-soft focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink',
              active ? 'text-ink' : 'text-titleOff hover:text-ink',
            )}
          >
            {title}
          </button>
          {pin && (
            <PinToggle
              pinned={pin.pinned}
              onToggle={pin.onToggle}
              label={pin.label ?? `pin ${title.toLowerCase()}`}
              className='mt-1.5'
            />
          )}
        </div>
        {action && isOpen && <div className='flex shrink-0 items-center self-center'>{action}</div>}
      </div>
      <div
        id={bodyId}
        inert={!isOpen}
        className={cn(
          'grid transition-[grid-template-rows] duration-700 ease-soft motion-reduce:transition-none',
          instant && 'transition-none',
        )}
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className='min-h-0 overflow-hidden'>
          <div className={cn('pb-14', stickyTop != null ? 'pt-3' : 'pt-5')}>{children}</div>
        </div>
      </div>
    </section>
  );
}

/** The stacking pitch of folded sticky titles: a 32px title row and a hair of air. */
export const CATEGORY_STACK_PITCH = '2.5rem';

/**
 * The `stickyTop` of every category in a panel: each one sticks below the folded titles that come
 * before it, so folded titles stack at the top and the open one being scrolled through sits under
 * the stack. `offset` is the panel's own top inset (a fixed header on a phone, for example).
 * Reached from outside `src/ui` as `Category.stackTops` (no new barrel export).
 */
export function categoryStackTops<K extends string>(
  order: readonly K[],
  folded: Partial<Record<K, boolean>>,
  { pitch = CATEGORY_STACK_PITCH, offset = '0px' }: { pitch?: string; offset?: string } = {},
): Record<K, string> {
  let before = 0;
  const tops = {} as Record<K, string>;
  for (const key of order) {
    tops[key] = `calc(${offset} + ${before} * ${pitch})`;
    if (folded[key]) before += 1;
  }
  return tops;
}

Category.stackTops = categoryStackTops;
Category.STACK_PITCH = CATEGORY_STACK_PITCH;
