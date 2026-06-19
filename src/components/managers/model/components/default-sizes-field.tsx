import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { ModelFormData } from './schema';
import { SizePickerModal } from './size-picker-modal';

// Multi-select of default sample sizes via the shared category/gender modal.
export function DefaultSizesField() {
  const { control } = useFormContext<ModelFormData>();
  const { field } = useController({ control, name: 'defaultSizeIds' });
  const gender = useWatch({ control, name: 'gender' }) as string;
  const { dictionary } = useDictionary();

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  const selectedIds = field.value ?? [];

  const toggle = (id: number) => {
    const set = new Set(selectedIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    field.onChange([...set]);
  };
  const remove = (id: number) => field.onChange(selectedIds.filter((x) => x !== id));

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='inactive' size='small'>
          default sizes (optional, multiple)
        </Text>
        <SizePickerModal
          selectedIds={selectedIds}
          onToggle={toggle}
          gender={gender}
          title='default sizes'
        />
      </div>

      {/* Selected summary (shown even if filtered out by the current gender) */}
      {selectedIds.length > 0 ? (
        <div className='flex flex-wrap gap-2'>
          {selectedIds.map((id) => (
            <span
              key={id}
              className='flex items-center gap-1 border border-textColor px-2 py-0.5 uppercase'
            >
              <Text size='small'>{formatSizeName(sizeById.get(id) ?? `#${id}`)}</Text>
              <button
                type='button'
                aria-label='remove size'
                onClick={() => remove(id)}
                className='leading-none'
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <Text variant='inactive' size='small'>
          none selected
        </Text>
      )}
    </div>
  );
}
