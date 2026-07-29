import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import { careCodes, careSelectionKey, parseSelectedCare, SelectedInstructions } from './care-codes';
import { CareSymbol } from './care-card';
import { CareInstructions } from './careInstructions';

// CARE_CODE_META is re-exported for the print doc and the style-facts field, which have imported it
// from here since before it moved into care-codes.
export { CARE_CODE_META } from './care-codes';

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
  const value = (useWatch({ name }) as string) || '';
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedInstructions>({});

  const codes = careCodes(value);

  // Legacy free-text care value (pre-ISO-code data) that parseSelected can't match to any known
  // code: the modal would otherwise open looking empty, and the operator's first pick silently
  // overwrites this text with no warning. Surface it as a note while it's still the stored value —
  // it disappears on its own once a real pick is written (the value then parses again).
  const trimmedValue = value.trim();
  const legacyValue =
    trimmedValue && Object.keys(parseSelectedCare(value)).length === 0 ? trimmedValue : undefined;

  const write = (next: SelectedInstructions) =>
    setValue(name, Object.values(next).join(','), { shouldDirty: true, shouldValidate: true });

  const onSelect = (category: string, _method: string, code: string, subCategory?: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      const key = careSelectionKey(category, subCategory);
      if (prev[key] === code) delete next[key];
      else next[key] = code;
      write(next);
      return next;
    });
  };

  const openModal = () => {
    setSelected(parseSelectedCare(value));
    setOpen(true);
  };
  const clear = () => {
    setSelected({});
    setValue(name, '', { shouldDirty: true, shouldValidate: true });
  };

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
            <Button type='button' variant='secondary' size='xs' onClick={openModal}>
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
