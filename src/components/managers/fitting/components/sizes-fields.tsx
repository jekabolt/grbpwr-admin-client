import { SizePickerModal } from 'components/managers/model/components/size-picker-modal';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { FittingFormData } from './schema';

// Sizes tried in the fitting. Sizes are picked via the shared category modal
// (filtered by the model's gender); each picked size carries an optional fit note.
export function SizesFields({ modelGender }: { modelGender?: string }) {
  const { control } = useFormContext<FittingFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'sizes' });
  const { dictionary } = useDictionary();

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  const selectedIds = fields.map((f) => f.sizeId);

  const toggle = (id: number) => {
    const idx = fields.findIndex((f) => f.sizeId === id);
    if (idx >= 0) remove(idx);
    else append({ sizeId: id, fitNote: '' });
  };

  return (
    <div className='space-y-3'>
      <SizePickerModal
        selectedIds={selectedIds}
        onToggle={toggle}
        gender={modelGender}
        title='sizes tried'
      />

      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no sizes selected
        </Text>
      ) : (
        <div className='space-y-2'>
          {fields.map((f, index) => (
            <div
              key={f.id}
              className='flex items-center gap-2 border border-textInactiveColor p-2'
            >
              <Text className='w-24 shrink-0 uppercase'>
                {formatSizeName(sizeById.get(f.sizeId) ?? `#${f.sizeId}`)}
              </Text>
              <div className='flex-1'>
                <InputField name={`sizes.${index}.fitNote`} placeholder='fit note (optional)' />
              </div>
              <Button
                type='button'
                variant='secondary'
                aria-label='remove size'
                onClick={() => remove(index)}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
