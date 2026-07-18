import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import { careInstruction } from './careInstruction';
import { CareInstructions } from './careInstructions';

type SelectedInstructions = { [category: string]: string };
type CareMethod = { code: string; img: string };

// code → { name, img } across all categories (Professional Care is nested one level deeper),
// so we can render the selected codes as their laundry symbols instead of raw text.
function buildCodeMeta(): Record<string, { name: string; img: string }> {
  const map: Record<string, { name: string; img: string }> = {};
  for (const [category, methods] of Object.entries(careInstruction.care_instructions)) {
    if (category === 'Professional Care') {
      for (const sub of Object.values(methods as Record<string, Record<string, CareMethod>>)) {
        for (const [name, m] of Object.entries(sub)) map[m.code] = { name, img: m.img };
      }
    } else {
      for (const [name, m] of Object.entries(methods as Record<string, CareMethod>)) {
        map[m.code] = { name, img: m.img };
      }
    }
  }
  return map;
}

// precomputed code → { name, img } map (also used by the print doc to render care symbols)
export const CARE_CODE_META = buildCodeMeta();

// parse the comma-joined codes string back into the modal's per-category selection map
function parseSelected(value: string): SelectedInstructions {
  const codes = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: SelectedInstructions = {};
  for (const [category, methods] of Object.entries(careInstruction.care_instructions)) {
    if (category === 'Professional Care') {
      for (const [subCategory, sub] of Object.entries(
        methods as Record<string, Record<string, CareMethod>>,
      )) {
        for (const m of Object.values(sub)) {
          if (codes.includes(m.code)) out[`${category}-${subCategory}`] = m.code;
        }
      }
    } else {
      for (const m of Object.values(methods as Record<string, CareMethod>)) {
        if (codes.includes(m.code)) out[category] = m.code;
      }
    }
  }
  return out;
}

// A name-parameterized care-instruction picker (reuses the product care modal). Stores the
// selected codes as a comma-joined string in the given field and renders them as the actual
// laundry SYMBOLS — far more convenient to read than the raw "MWN,DNB,…" codes.
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

  const codeMeta = CARE_CODE_META;
  const codes = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const write = (next: SelectedInstructions) =>
    setValue(name, Object.values(next).join(','), { shouldDirty: true, shouldValidate: true });

  const onSelect = (category: string, _method: string, code: string, subCategory?: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      const key =
        category === 'Professional Care' && subCategory ? `${category}-${subCategory}` : category;
      if (prev[key] === code) delete next[key];
      else next[key] = code;
      write(next);
      return next;
    });
  };

  const openModal = () => {
    setSelected(parseSelected(value));
    setOpen(true);
  };
  const clear = () => {
    setSelected({});
    setValue(name, '', { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className='space-y-1'>
      <FormLabel>{label}</FormLabel>
      <div className='flex min-h-9 items-center gap-2 border-b border-textInactiveColor'>
        <div className='flex flex-1 flex-wrap items-center gap-1 py-1'>
          {codes.length === 0 ? (
            <Text variant='inactive' size='small'>
              — none selected —
            </Text>
          ) : (
            codes.map((code) => {
              const m = codeMeta[code];
              return m?.img ? (
                <img key={code} src={m.img} title={m.name} alt={m.name} className='size-7' />
              ) : (
                <span key={code} className='text-textBaseSize'>
                  {code}
                </span>
              );
            })
          )}
        </div>
        {editMode && (
          <div className='flex shrink-0 gap-1'>
            {codes.length > 0 && (
              <Button
                type='button'
                variant='simple'
                onClick={clear}
                className='px-2 py-1 text-textBaseSize uppercase'
              >
                clear
              </Button>
            )}
            <Button
              type='button'
              variant='secondary'
              onClick={openModal}
              className='px-2 py-1 text-textBaseSize uppercase'
            >
              select
            </Button>
          </div>
        )}
      </div>
      <CareInstructions
        isCareTableOpen={open}
        close={() => setOpen(false)}
        onSelectCareInstruction={onSelect}
        selectedInstructions={selected}
      />
    </div>
  );
}
