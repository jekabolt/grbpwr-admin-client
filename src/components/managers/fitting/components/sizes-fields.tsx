import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { FittingFormData } from './schema';

export function SizesFields() {
  const { control } = useFormContext<FittingFormData>();
  const { dictionary } = useDictionary();
  const { fields, append, remove } = useFieldArray({ control, name: 'sizes' });
  const watchedSizes = useWatch({ control, name: 'sizes' }) ?? [];

  const allSizes = useMemo(() => dictionary?.sizes ?? [], [dictionary?.sizes]);

  // Per-row options exclude sizes already chosen in other rows, so a size can't be
  // added twice. The row keeps its own current selection.
  const optionsForRow = (rowIndex: number) => {
    const takenElsewhere = new Set(
      watchedSizes
        .map((s, i) => (i === rowIndex ? undefined : s?.sizeId))
        .filter((id): id is number => !!id),
    );
    return [
      { value: 0, label: '— select —' },
      ...allSizes
        .filter((s) => !takenElsewhere.has(s.id ?? -1))
        .map((s) => ({ value: s.id ?? 0, label: s.name ?? `#${s.id}` })),
    ];
  };

  return (
    <div className='space-y-3'>
      {fields.length === 0 && <Text variant='inactive'>no sizes added yet</Text>}
      {fields.map((field, index) => (
        <div
          key={field.id}
          className='flex flex-col gap-2 border border-textInactiveColor p-3 lg:flex-row lg:items-end'
        >
          <div className='lg:w-40'>
            <SelectField
              name={`sizes.${index}.sizeId`}
              label='size'
              items={optionsForRow(index)}
              valueAsNumber
            />
          </div>
          <div className='flex-1'>
            <InputField
              name={`sizes.${index}.fitNote`}
              label='fit note (optional)'
              placeholder='e.g. tight on shoulders'
            />
          </div>
          <Button type='button' variant='secondary' size='lg' onClick={() => remove(index)}>
            remove
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='main'
        size='lg'
        className='uppercase'
        onClick={() => append({ sizeId: 0, fitNote: '' })}
      >
        add size
      </Button>
    </div>
  );
}
