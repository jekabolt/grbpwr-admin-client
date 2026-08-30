import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, type JSX } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import { useColourDraft, type ColourDraft } from './drafts';
import { Swatch } from './field-row';
import {
  colourChips,
  colourLabel,
  colourRecipeKey,
  colourSwatchHex,
  feedIsTruncated,
} from './model';

/**
 * COLOUR HISTORY — «the same run ladder, sliced by colour · flat composition unchanged».
 *
 * A CHIP RESTORES A RECIPE AND NEVER A PICTURE, and the contract says so in as many words. Pressing
 * one refills the palette above with the colour and the words that run was submitted with; the
 * pictures of that run stay exactly where they are, in the history, unmoved. That is why the toast
 * spells it out: without the sentence, a chip that visibly changes the palette and visibly changes
 * nothing else reads as a control that failed.
 *
 * `stale` MARKS THE COMPOSITION, NOT THE COLOUR. A run froze which drawing stood in each slot; if
 * the bench has moved since, generating that colour again would colour DIFFERENT drawings. The chip
 * stays live — the recipe is still restorable, and that is the point — but it says so.
 *
 * AN ARCHIVED RUN STILL LEAVES ITS CHIP. Archiving hides a ROW of the history, presentationally and
 * reversibly; a recipe is not a picture and was never hidden by it. The chip is dimmed and the click
 * still works.
 *
 * THE SECTION VANISHES WHEN THERE IS NOTHING TO SLICE. A card that has never rendered has one chip
 * — «now» — and one chip is not a history, it is a label repeated. So nothing is drawn at all,
 * rather than an empty header that promises a list.
 */
export function ColourHistory({
  band,
  disabled,
  draft,
}: {
  band: GetDesignBandResponse;
  /** Accepted for one signature across the band's organs; the history writes nothing — a chip fills
   *  the menu above and the run is what carries the recipe anywhere. */
  techCardId: number;
  disabled?: boolean;
  draft?: ColourDraft;
}): JSX.Element | null {
  const own = useColourDraft(band);
  const state = draft ?? own;
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const colors = dictionary?.colors;

  const chips = useMemo(() => colourChips(band), [band]);

  if (!chips.length) return null;

  const currentKey = colourRecipeKey(state.recipe);

  return (
    <div>
      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span' className='normal-case'>
            the same run ladder, sliced by colour · flat composition unchanged
          </Text>
        }
      >
        colour history
      </GroupLabel>

      <ChipRow>
        <Chip selected title='what the palette above holds right now'>
          <Swatch hex={colourSwatchHex(state.recipe, colors)} size={12} className='border-bgColor' />
          <span>{colourLabel(state.recipe, colors)}</span>
          <span className='opacity-70'>now</span>
        </Chip>

        {chips.map((chip) => {
          const tail = [
            chip.rrev > 0 ? `r${chip.rrev}` : null,
            chip.run ? `${chip.pictures} picture${chip.pictures === 1 ? '' : 's'}` : null,
            chip.stale ? 'stale' : null,
            chip.archived ? 'archived' : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Chip
              key={chip.key}
              className={chip.archived ? 'opacity-60' : undefined}
              title={
                chip.stale
                  ? 'the bench has moved since this run — restoring the recipe does not restore the drawings it coloured'
                  : 'restore this recipe into the palette above'
              }
              onClick={
                disabled
                  ? undefined
                  : () => {
                      state.restore(chip.recipe);
                      showMessage(
                        'recipe restored — the picture is not: press GENERATE',
                        'success',
                      );
                    }
              }
              pressed={chip.key === currentKey}
            >
              <Swatch hex={colourSwatchHex(chip.recipe, colors)} size={12} />
              <span>{colourLabel(chip.recipe, colors)}</span>
              {tail && <span className='opacity-70'>{tail}</span>}
            </Chip>
          );
        })}
      </ChipRow>

      {/* A chip whose run is off-page carries no `rN · k pictures` tail, and the reason is worth one
          line: the recipes are computed over the WHOLE card, the runs are one page. The chip is
          still fully restorable — the tail is the only thing missing. */}
      {feedIsTruncated(band) && chips.some((chip) => !chip.run) && (
        <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
          Some chips carry no revision: their run is older than the page of history loaded here. The
          recipe still restores.
        </Text>
      )}
    </div>
  );
}
