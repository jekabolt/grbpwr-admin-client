import { useState } from 'react';

import { cn } from 'lib/utility';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';

/**
 * THE block — the unit every screen in this admin is built from.
 * See DESIGN.md → "1. Overview" and "5. Components → The Block".
 *
 * White stock (`bg-bgColor`) inside a 1px outer edge (`border-borderColor`), sitting on the
 * grey page ground. Three things about it are not style preferences:
 *
 *  1. The FILL is load-bearing. A bordered box without `bg-bgColor` lets the grey ground show
 *     straight through its contents, and data stops reading as data. Six managers shipped that
 *     bug (`border border-textInactiveColor p-4` with no background) before this primitive
 *     existed.
 *  2. The GUTTER is the divider. Blocks are separated by 24px of ground, never by a drawn line
 *     — both neighbours already carry their own outline, so a rule in the gutter renders as a
 *     triple line. Use `SectionStack`.
 *  3. A block NEVER contains another block. Sub-structure is `GroupLabel` + `Row`, i.e. ruled
 *     weights, not a second border+fill. Box-in-box is the single most visible way to miss
 *     this design.
 *
 * The title sits on a 2px ink rule (`SectionHeader`), not on an 18px heading. `question` is the
 * grey trailing clause saying what the block is FOR — use it; it is most of why this product
 * reads as explained rather than merely labelled.
 */
export function Section({
  title,
  question,
  action,
  id,
  className,
  headerClassName,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  /** Omit for an untitled block (a bare panel of controls). */
  title?: string;
  /** Grey trailing clause: what this block is for. */
  question?: React.ReactNode;
  /** Right-aligned control in the header rule (a button, a count, a filter). */
  action?: React.ReactNode;
  /** Anchor id, for screens with an in-page section nav. */
  id?: string;
  className?: string;
  headerClassName?: string;
  /** Secondary blocks on a long form can start closed to keep it scannable. */
  collapsible?: boolean;
  /**
   * Followed live, so a caller can pass a derived value ("open while there's data in it").
   * An explicit toggle by the user wins from then on and is never fought by the data.
   */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? defaultOpen;
  const isOpen = !collapsible || open;

  return (
    <section
      id={id}
      className={cn(
        'space-y-stack border border-borderColor bg-bgColor p-block',
        id && 'scroll-mt-20',
        className,
      )}
    >
      {title && (
        <SectionHeader
          title={title}
          question={question}
          className={headerClassName}
          action={
            collapsible ? (
              <>
                {action}
                <button
                  type='button'
                  onClick={() => setManual(!open)}
                  aria-expanded={isOpen}
                  aria-controls={id}
                  className='cursor-pointer uppercase text-labelColor hover:text-textColor'
                >
                  <Text size='micro' variant='uppercase' tracking='label' component='span'>
                    {isOpen ? '− hide' : '+ show'}
                  </Text>
                </button>
              </>
            ) : (
              action
            )
          }
        />
      )}
      {isOpen && children}
    </section>
  );
}

/**
 * The stack of blocks on a page: `--spacing-gutter` (24px) of ground between each, which is the
 * only divider this design has.
 *
 * Use this instead of a hand-written `flex flex-col gap-N`. The gutter is a semantic value, not
 * a whim — before it was a token it had drifted across gap-2.5 / gap-3 / gap-4 / gap-6, so the
 * same divider read at four different weights depending on which screen you were on.
 *
 * `row` lays the blocks side by side from `lg` up (stacked below it), for the common
 * two-column header/detail pairing.
 */
export function SectionStack({
  row,
  hidden,
  className,
  children,
}: {
  /** Side by side from `lg` up, stacked below. */
  row?: boolean;
  /**
   * Tab panels are the dominant page shape in this admin and they stay mounted (form state
   * lives across tabs), so the stack has to be hideable without a wrapper div. Tailwind's
   * preflight applies `display: none !important` to `[hidden]`, so it wins over `flex`.
   */
  hidden?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      hidden={hidden}
      className={cn('flex flex-col gap-gutter', row && 'lg:flex-row lg:items-start', className)}
    >
      {children}
    </div>
  );
}
