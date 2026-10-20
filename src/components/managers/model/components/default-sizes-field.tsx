import { formatSizeName } from 'components/managers/product/utility/sizes';
import { cn } from 'lib/utility';
import { useFormContext, useWatch } from 'react-hook-form';
import { Arrow, Chip, FormField, FormItem, FormLabel } from 'ui';
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
            {/* The whole box is the popover trigger (a div, so chip × buttons are not nested in a
                button); × stops propagation, so removing never opens. Box = Input/Select box. */}
            <SizePickerModal
              selectedIds={selectedIds}
              onToggle={toggle}
              gender={gender}
              title='sizes'
              renderTrigger={(isOpen) => (
                <div
                  role='button'
                  tabIndex={0}
                  aria-label='sizes'
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.currentTarget.click();
                    }
                  }}
                  className='flex min-h-6.5 w-full cursor-pointer flex-wrap items-center gap-1 border border-borderColor bg-bgColor px-2 py-0.5 text-textBaseSize transition-colors focus:border-textColor focus:outline-none data-[state=open]:border-textColor'
                >
                  {selectedIds.map((id) => (
                    <Chip
                      key={id}
                      onRemove={() => remove(id)}
                      className='h-5 px-1.5 py-0 text-textBaseSize leading-4 text-textColor'
                    >
                      {formatSizeName(sizeById.get(id) ?? `#${id}`)}
                    </Chip>
                  ))}
                  <Arrow
                    aria-hidden
                    className={cn(
                      'ml-auto shrink-0 rotate-180 text-textColor',
                      isOpen && 'rotate-0',
                    )}
                  />
                </div>
              )}
            />
          </FormItem>
        );
      }}
    />
  );
}
