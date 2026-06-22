import { SizePickerModal } from 'components/managers/model/components/size-picker-modal';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { TechCardFormData } from './schema';

// Size range / grade for the tech card (FK size ids). Sizes are picked via the
// shared category modal, filtered by the card's target gender. POM grades in later
// phases must reference ids from this set.
export function SizeIdsField() {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();

  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const gender = useWatch({ control, name: 'targetGender' }) as string | undefined;

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  const toggle = (id: number) => {
    const next = sizeIds.includes(id) ? sizeIds.filter((x) => x !== id) : [...sizeIds, id];
    setValue('sizeIds', next, { shouldDirty: true });
  };

  return (
    <div className='space-y-3'>
      <SizePickerModal
        selectedIds={sizeIds}
        onToggle={toggle}
        gender={gender}
        triggerLabel='select sizes'
        title='size range'
      />

      {sizeIds.length === 0 ? (
        <Text variant='inactive' size='small'>
          no sizes selected
        </Text>
      ) : (
        <div className='flex flex-wrap gap-2'>
          {sizeIds.map((id) => (
            <div
              key={id}
              className='flex items-center gap-2 border border-textInactiveColor px-2 py-1'
            >
              <Text variant='uppercase' size='small'>
                {formatSizeName(sizeById.get(id) ?? `#${id}`)}
              </Text>
              <Button
                type='button'
                aria-label='remove size'
                className='leading-none'
                onClick={() => toggle(id)}
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
