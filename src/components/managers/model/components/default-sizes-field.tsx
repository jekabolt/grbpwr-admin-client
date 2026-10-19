import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useFormContext, useWatch } from 'react-hook-form';
import { Chip, FormField, FormItem, FormLabel } from 'ui';
import { ModelFormData } from './schema';
import { SizePickerModal } from './size-picker-modal';
import { useSizeNames } from './use-size-systems';

// Multi-select of default sample sizes via the shared category/gender modal.
export function DefaultSizesField() {
  const { control } = useFormContext<ModelFormData>();
  const gender = useWatch({ control, name: 'gender' }) as string;
  const sizeById = useSizeNames();

  return (
    <FormField
      control={control}
      name='defaultSizeIds'
      render={({ field }) => {
        const selectedIds = field.value ?? [];
        const toggle = (id: number) => {
          const selected = new Set(selectedIds);
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          field.onChange([...selected]);
        };
        const remove = (id: number) =>
          field.onChange(selectedIds.filter((selectedId) => selectedId !== id));

        return (
          <FormItem>
            <FormLabel>sizes</FormLabel>
            <div className='flex min-h-6 w-full flex-wrap items-center gap-1 border border-borderColor bg-bgColor px-2 py-0.5 focus-within:border-textColor'>
              {selectedIds.map((id) => (
                <Chip
                  key={id}
                  onRemove={() => remove(id)}
                  className='h-5 px-1.5 py-0 text-textBaseSize leading-4 text-textColor'
                >
                  {formatSizeName(sizeById.get(id) ?? `#${id}`)}
                </Chip>
              ))}
              <span aria-hidden className='min-w-2 flex-1 self-stretch' />
              <SizePickerModal
                selectedIds={selectedIds}
                onToggle={toggle}
                gender={gender}
                triggerLabel=''
                title='sizes'
                triggerClassName='shrink-0 border-0 px-1 py-0'
              />
            </div>
          </FormItem>
        );
      }}
    />
  );
}
