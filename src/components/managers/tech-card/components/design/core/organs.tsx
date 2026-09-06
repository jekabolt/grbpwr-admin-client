import type { googletype_Decimal } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { formatMoney } from '../generation/money';

/**
 * THE STUDIO'S SHARED ORGANS — the small things every band screen draws and used to spell for
 * itself. Nothing here carries state or reads the wire; each organ is a printer over the app's own
 * primitives (`Pill`, `Text`), so the skin stays the skin of `ui/components`.
 */

/**
 * `2 of 6 sides` / `7 pictures` — a read-only count as a Pill.
 *
 * `noun` is the SINGULAR; the plural is `noun + 's'` unless `plural` says otherwise. With `total`
 * the plural follows the total (`1 of 6 sides`), without it — the count (`1 picture`).
 *
 * ZERO IS THE `gap` TONE — DASHED GREY, NEVER RED. The mock-up's own rule (`_core.js` `counter`:
 * `pill(text, n ? '' : 'gap')`, and the note beside it: «gap значит „не хватает" и НЕ красный:
 * красный в этом админе значит убыток»), and the owner's, seeing the beta paint every empty
 * count red on all seven steps. An empty list is not a loss and not a fault; it is a place not
 * reached yet, and the dashed edge is the mark every empty cell and «+ add» chip already wears.
 * `warn` on this organ used to lean on `colour-plan/parts-row.tsx`, which paints an unassigned
 * colour red — that one IS a fault of the recipe (a run cannot start without it), so it keeps
 * its red; a count of zero is not.
 */
export function Counter({
  n,
  noun,
  plural,
  total,
  className,
  title,
}: {
  n: number;
  noun: string;
  plural?: string;
  total?: number;
  className?: string;
  title?: string;
}) {
  const many = plural ?? `${noun}s`;
  const word = (total ?? n) === 1 ? noun : many;
  return (
    <Pill tone={n === 0 ? 'gap' : 'mut'} className={className} title={title}>
      {total != null ? `${n} of ${total} ${word}` : `${n} ${word}`}
    </Pill>
  );
}

/**
 * One line for an empty LIST — not an empty form. A form's blank field is its own affordance; a
 * list with nothing in it has to say so in words, or the screen reads as broken.
 *
 * `action` is the one door that fills the list (a button, a chip); it sits after the sentence.
 */
export function EmptyState({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline gap-2', className)}>
      <Text size='micro' variant='label' component='p' className='min-w-0'>
        {children}
      </Text>
      {action && <div>{action}</div>}
    </div>
  );
}

/**
 * The price of ONE run, as `generation/money.ts` speaks it.
 *
 * THE RULE OF THAT FILE HOLDS HERE: an absent decimal is «not stated», never zero, and this organ
 * NEVER prints `$0.00` for it. When the amount is stated, the amount is printed and `note` is
 * dropped — a price and «priced later» cannot both be true.
 *
 * WHEN THE AMOUNT IS NOT STATED the organ prints `note` instead — by default the band's own
 * pre-run sentence, `priced by the server when the run starts`, which already stands verbatim on
 * the generate row, the construction draft and the pattern studio. That default is for the
 * POSITION BEFORE A RUN, where no price can exist yet. A reader of a FINISHED row — where an absent
 * price means «this account may not see it» (costing-shaped fields are stripped without
 * `costing:read`) — passes `note={null}` and the organ renders nothing at all, as money.ts asks.
 */
export const PRICED_LATER = 'priced by the server when the run starts';

export function Money({
  value,
  currency,
  note = PRICED_LATER,
  className,
  ...rest
}: {
  value?: googletype_Decimal | null;
  currency?: string | null;
  /** `null` = say nothing when the amount is not stated. */
  note?: string | null;
  className?: string;
  [k: string]: unknown;
}) {
  const money = formatMoney(value, currency);
  if (!money && note == null) return null;
  return (
    <Text
      size='micro'
      variant='label'
      component='span'
      className={cn('min-w-0', className)}
      {...rest}
    >
      {money || note}
    </Text>
  );
}
