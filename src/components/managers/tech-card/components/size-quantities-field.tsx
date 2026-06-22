import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';

// Production size run — order quantity per size (cutter / manager). sizeId is restricted
// to the card's size range (cross-validated server-side: size_quantities[].size_id ∈ size_ids).
export function SizeQuantitiesField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'sizeQuantities' });
  const { dictionary } = useDictionary();
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  const sizeOptions = sizeIds.map((id) => ({
    value: id,
    label: formatSizeName(sizeById.get(id) ?? `#${id}`),
  }));

  if (sizeIds.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        pick sizes above to set the order quantity per size
      </Text>
    );
  }

  return (
    <div className='space-y-2'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no size run set
        </Text>
      ) : (
        fields.map((f, index) => (
          <div key={f.id} className='grid grid-cols-1 items-end gap-2 lg:grid-cols-3'>
            <SelectField
              name={`sizeQuantities.${index}.sizeId`}
              label='size'
              items={sizeOptions}
              valueAsNumber
            />
            <InputField
              name={`sizeQuantities.${index}.orderQty`}
              type='number'
              valueAsNumber
              label='order qty'
            />
            <Button
              type='button'
              variant='secondary'
              aria-label='remove size qty'
              className='w-fit'
              onClick={() => remove(index)}
            >
              ✕
            </Button>
          </div>
        ))
      )}

      <Button
        type='button'
        className='uppercase'
        onClick={() => append({ sizeId: sizeOptions[0]?.value ?? 0, orderQty: 0 })}
      >
        add size qty
      </Button>
    </div>
  );
}
