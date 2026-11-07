import { CARE_ARTWORK } from 'components/managers/product/components/care/care-artwork';
import {
  careCodes,
  careSelectionKey,
  type CareSymbolView,
  type SelectedInstructions,
} from 'components/managers/product/components/care/care-codes';
import { CareInstructions } from 'components/managers/product/components/care/careInstructions';
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { useMemo, useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, Text } from 'ui';
import type { TechCardFormData } from '../schema';

export function CareSymbolsRow({ disabled }: { disabled?: boolean }): JSX.Element {
  const { setValue, control } = useFormContext<TechCardFormData>();
  const value = (useWatch({ control, name: 'careInstructions' }) as string) || '';
  const vocabulary = useCareVocabulary();
  const [open, setOpen] = useState(false);
  const codes = careCodes(value);
  const selected = useMemo(() => vocabulary.parseSelected(value), [vocabulary, value]);

  const write = (next: SelectedInstructions) => {
    const known = new Set(vocabulary.slots.map((slot) => slot.key));
    const ordered = vocabulary.slots.map((slot) => next[slot.key]).filter(Boolean);
    const orphaned = Object.entries(next)
      .filter(([key, code]) => code && !known.has(key))
      .map(([, code]) => code);
    setValue('careInstructions', [...ordered, ...orphaned].join(','), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onSelect = (symbol: CareSymbolView) => {
    const key = careSelectionKey(symbol.category, symbol.subCategory);
    const next = { ...selected };
    if (next[key] === symbol.code) delete next[key];
    else next[key] = symbol.code;
    write(next);
  };

  return (
    <>
      <span
        className='flex min-w-0 flex-wrap items-center gap-1.5'
        data-care-symbols={codes.join(',')}
      >
        {codes.map((code) => {
          const symbol = vocabulary.byCode[code];
          const src = symbol?.img ?? CARE_ARTWORK[code];
          return (
            <span
              key={code}
              title={symbol?.name ?? code}
              className='flex h-7 w-7 items-center justify-center border border-borderColor bg-bgColor'
            >
              {src ? (
                <img src={src} alt={symbol?.name ?? code} className='h-6 w-6 object-contain' />
              ) : (
                <Text component='span' size='nano' variant='label'>
                  ?
                </Text>
              )}
            </span>
          );
        })}
        <Button
          type='button'
          variant='secondary'
          size='xs'
          disabled={disabled}
          onClick={() => setOpen(true)}
          className='h-7'
        >
          {codes.length ? 'Edit' : '+ Care'}
        </Button>
      </span>
      <CareInstructions
        isCareTableOpen={open}
        close={() => setOpen(false)}
        onSelectCareInstruction={onSelect}
        selectedInstructions={selected}
      />
    </>
  );
}
