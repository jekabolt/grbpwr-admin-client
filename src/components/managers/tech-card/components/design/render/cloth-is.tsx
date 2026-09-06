import { useEffect, useState, type JSX } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import type { ColourDraft } from './drafts';
import {
  CLOTH_GSM_MAX,
  CLOTH_GSM_MIN,
  CLOTH_OPACITIES,
  clothWordsRank,
  normaliseGsm,
  readGsm,
} from './model';

/**
 * ═══ CLOTH IS — the weight and the transparency of the cloth, ONE LINE (H-13, mockup `r3IsRow`) ═══
 *
 * Владелец: «нам надо иметь возможность сказать на генерации фабрик рендеров что ткань
 * полупрозрачная например или имеет примерно такую грамматуру».
 *
 * TWO AXES OF DIFFERENT NATURE, HENCE TWO CONTROLS: the transparency is a closed vocabulary of
 * three words (chips: one chosen, a second press takes it off — «not said» is a legal answer), the
 * weight is a NUMBER a person knows as a number («примерно ТАКУЮ грамматуру»), so it is a field and
 * not a word ladder.
 *
 * ONE ROW, NOT TWO STOREYS — the mockup's `.rowline`: the label and its 84px field are one
 * unbreakable piece, the chips follow; a wrap, if it has to happen, happens BETWEEN the weight and
 * the chips, never inside the label.
 *
 * THE CLAMP LIVES AT THE DOOR, NOT AS A RED BORDER. A typo (18000 for 180) would ride into the
 * prompt as «about 18000 g/m²» and cost the run; the value is settled on blur (`normaliseGsm`), as
 * `normaliseRepeat` settles the pattern's repeat. The FLOOR is not clamped while typing — «180» is
 * typed through «1» and «18», and a floor applied on every digit would turn the first one into 20
 * under the finger; a weight under the floor is named by a pill in the group's header instead.
 *
 * ⚠ THIS ROW DOES NOT WRITE `words`. It writes the draft's CLOTH fields, and `statedWords` — the one
 * composer — joins them into the wire's `colour.words` at the door.
 *
 * `data-words-rank` — the same anchor as before, on the row: which of the recipe's statements
 * governs the cloth is computed by the model (`clothWordsRank`), read by this row and by the modal
 * «what the model gets», so the two surfaces cannot part.
 */
export function ClothIsRow({
  draft,
  disabled,
}: {
  draft: ColourDraft;
  disabled?: boolean;
}): JSX.Element {
  const { opacity, weightGsm } = draft.cloth;
  const rank = clothWordsRank(draft.recipe);

  /**
   * THE FIELD OWNS THE EDITABLE REPRESENTATION, THE DRAFT OWNS THE VALUE. «180.» is a legal state of
   * typing and no number expresses it; `String(180)` would drop the point under the finger. The
   * effect below resyncs the two only when the number changed NOT through this field (a seed, a
   * recipe restored from history, the visible clamp on blur).
   */
  const [wrote, setWrote] = useState<string>(() => (weightGsm > 0 ? String(weightGsm) : ''));
  useEffect(() => {
    setWrote((prev) => (readGsm(prev) === weightGsm ? prev : weightGsm > 0 ? String(weightGsm) : ''));
  }, [weightGsm]);

  const light = weightGsm > 0 && weightGsm < CLOTH_GSM_MIN;

  return (
    <div data-cloth-is data-words-rank={rank.governs ? 'governs' : 'outranked'}>
      <GroupLabel
        action={
          light ? (
            <Pill
              tone='attention'
              title={`the weight is settled to ${CLOTH_GSM_MIN}…${CLOTH_GSM_MAX} g/m² when the run starts`}
            >
              {CLOTH_GSM_MIN} to {CLOTH_GSM_MAX} g/m²
            </Pill>
          ) : undefined
        }
      >
        cloth is
      </GroupLabel>
      <div className='flex flex-wrap items-center gap-3'>
        {/* The label and its field: one piece. `g/m²` is case-significant, so no uppercase on it. */}
        <span className='flex shrink-0 items-center gap-1.5'>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='whitespace-nowrap'
          >
            <span className='uppercase'>weight</span> g/m²
          </Text>
          <div className='w-[84px] shrink-0'>
            <Input
              name='design-cloth-weight'
              data-cloth-weight
              /* `type='text'` with the numeric keyboard, NOT `type='number'`: a number input reports
                 `''` for «12.» and the controlled field would wipe the typing under the finger. */
              type='text'
              inputMode='numeric'
              aria-label={`cloth weight in grams per square metre, ${CLOTH_GSM_MIN} to ${CLOTH_GSM_MAX}`}
              value={wrote}
              disabled={disabled}
              placeholder='180'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const next = e.target.value.replace(/[^\d.,]/g, '').slice(0, 8);
                setWrote(next);
                draft.patchCloth({ weightGsm: readGsm(next) });
              }}
              onBlur={() => {
                const settled = normaliseGsm(readGsm(wrote));
                setWrote(settled > 0 ? String(settled) : '');
                draft.patchCloth({ weightGsm: settled });
              }}
            />
          </div>
        </span>
        <ChipRow>
          {CLOTH_OPACITIES.map((word) => {
            const on = opacity === word;
            return (
              <Chip
                key={word}
                nonForm
                selected={on}
                pressed={on}
                disabled={disabled}
                data-cloth-opacity={word}
                title={
                  on
                    ? 'press again to say nothing about how much light this cloth lets through'
                    : `this run is asked for a ${word} cloth`
                }
                onClick={() => draft.patchCloth({ opacity: on ? '' : word })}
              >
                {/* The wire word keeps its hyphen; the screen reads it as the mockup prints it. */}
                {word.replace('-', ' ')}
              </Chip>
            );
          })}
        </ChipRow>
      </div>
    </div>
  );
}
