import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import { careCodes, careSelectionKey, CareSymbolView, SelectedInstructions } from './care-codes';
import { CareSymbol } from './care-card';
import { CareInstructions } from './careInstructions';
import { useCareVocabulary } from './use-care-vocabulary';

/**
 * Care instructions as the ISO laundry SYMBOLS they are, not the "MWN,DNB,…" codes underneath.
 *
 * The field is a box like every other field since phase 02 — it used to be an underline, which read
 * as a text input the symbols happened to be sitting in. What is stored is still the comma-joined
 * code string; only the way it is picked and shown changed.
 *
 * A symbol with no chip around it would be indistinguishable from an icon button, so each selected
 * code renders as a bordered swatch carrying its code beneath — that is the label the factory reads
 * off the care tag, and the picture is what the operator recognises.
 */
export function CarePicker({
  name,
  label = 'care instructions',
  editMode = true,
}: {
  name: string;
  label?: string;
  editMode?: boolean;
}) {
  const { setValue } = useFormContext();
  const vocabulary = useCareVocabulary();
  const value = (useWatch({ name }) as string) || '';
  const [open, setOpen] = useState(false);

  const codes = careCodes(value);

  // The selection is DERIVED from the field, never held alongside it. It used to be its own state
  // synced when the modal opened, which meant any write to the field from elsewhere (a form reset,
  // a staged value landing) left the modal showing a selection the field no longer had.
  const selected = useMemo(() => vocabulary.parseSelected(value), [vocabulary, value]);

  // Legacy free-text care value (pre-ISO-code data) that resolves to no known code: the modal would
  // otherwise open looking empty, and the operator's first pick silently overwrites this text with
  // no warning. Surface it as a note while it's still the stored value — it disappears on its own
  // once a real pick is written (the value then parses again).
  //
  // Only once the vocabulary is LOADED, though: with no care symbols in the dictionary nothing parses,
  // so a perfectly good "MW30,DNB" would be announced as free text about to be replaced. Nothing can
  // be picked in that state anyway — the modal says so — so there is nothing to warn about.
  const trimmedValue = value.trim();
  const legacyValue =
    vocabulary.loaded && trimmedValue && Object.keys(selected).length === 0
      ? trimmedValue
      : undefined;

  /**
   * Write the selection back in the dictionary's print order — wash → bleach → dry → iron →
   * professional — which is the order the backend canonicalises to on save. Writing click order
   * instead meant the value visibly reordered itself the first time the style was reloaded.
   */
  const write = (next: SelectedInstructions) => {
    const known = new Set(vocabulary.slots.map((s) => s.key));
    const ordered = vocabulary.slots.map((slot) => next[slot.key]).filter(Boolean);
    // A slot the vocabulary no longer offers (its whole category archived) still holds a real code
    // on a real style. Carry it rather than dropping it as a side effect of an unrelated pick.
    const orphaned = Object.entries(next)
      .filter(([key, code]) => code && !known.has(key))
      .map(([, code]) => code);
    setValue(name, [...ordered, ...orphaned].join(','), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onSelect = (symbol: CareSymbolView) => {
    const key = careSelectionKey(symbol.category, symbol.subCategory);
    const next = { ...selected };
    // Clicking the symbol already in a slot clears it; clicking a different one replaces it.
    if (next[key] === symbol.code) delete next[key];
    else next[key] = symbol.code;
    write(next);
  };

  const clear = () => setValue(name, '', { shouldDirty: true, shouldValidate: true });

  return (
    <div className='space-y-1'>
      <FormLabel>{label}</FormLabel>
      <div className='flex min-h-9 items-start gap-2 border border-borderColor p-1.5'>
        <div className='flex flex-1 flex-wrap items-start gap-1.5'>
          {codes.length === 0 ? (
            <Text variant='label' size='micro' className='py-1'>
              — none selected —
            </Text>
          ) : (
            codes.map((code) => <CareSymbol key={code} code={code} />)
          )}
        </div>
        {editMode && (
          <div className='flex shrink-0 gap-1'>
            {codes.length > 0 && (
              <Button type='button' variant='simple' size='xs' onClick={clear}>
                clear
              </Button>
            )}
            <Button type='button' variant='secondary' size='xs' onClick={() => setOpen(true)}>
              select
            </Button>
          </div>
        )}
      </div>
      {legacyValue && (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            stored as free text: “{legacyValue}” — picking a symbol replaces it
          </Text>
        </CalloutBox>
      )}
      <CareInstructions
        isCareTableOpen={open}
        close={() => setOpen(false)}
        onSelectCareInstruction={onSelect}
        selectedInstructions={selected}
        legacyValue={legacyValue}
      />
    </div>
  );
}
