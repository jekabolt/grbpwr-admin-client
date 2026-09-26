import { useFormContext } from 'react-hook-form';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { FormField, FormItem, FormLabel } from 'ui/form';

import type { TechCardFormData } from '../schema';
import { DraftedField, DraftedPill } from './core/drafted-field';
import { draftedKey, useDrafted } from './drafted-contract';
import { fitLabel, type FitChoice } from './fit-vocabulary';

/**
 * ═══ THE STYLE-FACT CELLS TWO STEPS SHARE — CARD DETAILS and GENERAL INFORMATION (26.09, O-29) ═══
 *
 * The owner asked to edit FIT and CATEGORY right where GENERAL INFORMATION prints them, behind one
 * `✎`, instead of walking through `edit in card details ›`. Two editors of one fact on two steps
 * is exactly what wave 25.09 (T05) removed — the fit select of GENERAL INFORMATION and the one of
 * CARD DETAILS drifted apart on the first fix — so the second surface does not get a second
 * editor: it mounts THE SAME cell. This file is where that cell lives, moved out of
 * `card-details.tsx` unchanged; the category cell is `CategoryBrowser` (`../header-meta-fields.tsx`),
 * already the one organ both callers import by name.
 *
 * Nothing here knows which step it is on. The cell edits the form field `fit` and nothing else;
 * the WRITER is still the staged `UpdateStyle` in `StyleFactsField` (mounted hidden by index.tsx),
 * the lock is still `products:write` (`locked`), and a genuine pick still accepts the draft's mark.
 */

/**
 * THE SELECT'S VALUES ARE A NAMESPACE OF THEIR OWN (Codex m2). Every fit — listed or legacy — is
 * `fit:<stored string>`, and «— unset —» is the bare word `none`, which no `fit:` value can equal.
 * The old sentinel `__unset__` was a string a legacy record could hold: its item and «unset» would
 * have been one value, and picking it would have cleared the fit.
 *
 * NOT the shared Select's own empty option (a '' item), on purpose: offering '' switches off the
 * primitive's guard against the PHANTOM '' Radix emits when the value and its item arrive in the
 * same render (`select.tsx`, `references-section.tsx`). MEASURED on this cell (`probe-card.mjs`
 * scene L, the card inside a <form> as on the page — only there does Radix mount its native
 * <select>): with a '' item, a re-read moving category + fit together, a re-read to a fit outside
 * the list and a draft writing one ALL came out as '' — a fit cleared that nobody touched. With no
 * '' item the guard stays on and each keeps its value.
 */
const FIT_NONE = 'none';
const FIT_ITEM = 'fit:';
const fitItem = (fit: string) => `${FIT_ITEM}${fit}`;
const fitOfItem = (item: string) => (item.startsWith(FIT_ITEM) ? item.slice(FIT_ITEM.length) : '');

/**
 * FIT — ONE SELECT, BOUND TO THE FORM FIELD `fit` (T02, D-03). It moved to CARD DETAILS from
 * GENERAL INFORMATION, which since O-29 mounts this same cell inline behind its `✎`. The WRITER
 * did not move: fit is a style fact, and the one thing that sends it is the staged `UpdateStyle`
 * in `StyleFactsField` (mounted hidden by index.tsx), exactly as before — this cell edits the form
 * field and nothing else.
 *
 * · ITEMS FOLLOW THE GARMENT. `choices` is the family's list for the card's top category
 *   (`fitsForTopCategory`); with no category yet it is the whole vocabulary, grouped.
 * · A STORED VALUE IS NEVER HIDDEN. A fit outside the family's list (the category changed after, an
 *   older record, a value typed before the list settled) stays as its own `(legacy)` item and stays
 *   selected — a select that cannot show its value lets Radix report a phantom '' and the next save
 *   would wipe a fact nobody touched.
 * · `— unset —` is how a fit is removed; there is no second control for it.
 * · DRAFTED: the construction draft may have written this value; the frame and the word stand until
 *   the value is edited or accepted (`drafted-contract.ts`). The word sits in the label row — a
 *   22px select has no room for a corner pill — and it IS the accept control (`DraftedPill`, as
 *   on every drafted field since CL-B's M3): pressing it accepts the fit's journal entry and
 *   leaves the value alone. Locked with the select (`disabled`, CL-B r2 MIN-5): a fit this account
 *   cannot change is not one it reviews either. A genuine pick is a review too: it accepts the
 *   same entry, so going back to the drafted value later does not bring the mark back — the
 *   select's own form of `useAcceptOnEdit`, which a text field runs on blur.
 * · LOCKED without `products:write`: `UpdateStyle` is authorised by the catalog section, not by
 *   `tech_cards` (Codex M-05), so an edit here would be refused at save. Said in words under the
 *   control, not only in a `title` on a dead select.
 */
export function FitCell({
  choices,
  creating,
  locked,
}: {
  choices: FitChoice[];
  /** A card that does not exist yet (`/add-tech-card`): no `UpdateStyle` can reach it. */
  creating: boolean;
  /** `products:write` missing, or a released card — the select and its pill are dead. */
  locked: boolean;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const drafted = useDrafted();
  return (
    <FormField
      control={control}
      name='fit'
      render={({ field }) => {
        // A NEW card by an account that cannot write the style gets no fit at all (UpdateStyle is
        // its only writer — see AgeGroupCell): drawn as the cell will read once the card exists.
        const value = creating && locked ? '' : ((field.value as string | undefined) ?? '').trim();
        const live = drafted.isLive(draftedKey.fit, value);
        const listed = choices.some((c) => c.key === value);
        const items = [
          { value: FIT_NONE, label: '— unset —' },
          ...(value && !listed
            ? [{ value: fitItem(value), label: `${fitLabel(value)} (legacy)` }]
            : []),
          ...choices.map((c) => ({
            value: fitItem(c.key),
            label: fitLabel(c.key),
            group: c.group,
          })),
        ];
        return (
          <FormItem
            data-card-fit={locked ? 'locked' : 'open'}
            title={locked ? 'needs products:write' : undefined}
          >
            <div className='flex items-center justify-between gap-1.5'>
              <FormLabel>fit</FormLabel>
              <DraftedPill
                live={live}
                onAccept={() => drafted.acceptKey(draftedKey.fit)}
                disabled={locked}
              />
            </div>
            <DraftedField live={live} pill={false}>
              <Select
                name='fit'
                placeholder='fit'
                items={items}
                value={value ? fitItem(value) : FIT_NONE}
                disabled={locked}
                // Reads as a dead control, like a disabled `Input` (zebra ground, label ink).
                className={locked ? 'bg-bgZebra text-labelColor' : undefined}
                onValueChange={(v: string) => {
                  const next = fitOfItem(v);
                  field.onChange(next);
                  if (next !== value) drafted.acceptKey(draftedKey.fit);
                }}
                onBlur={field.onBlur}
              />
            </DraftedField>
            {locked && (
              <Text size='micro' variant='label'>
                needs products:write
              </Text>
            )}
          </FormItem>
        );
      }}
    />
  );
}
