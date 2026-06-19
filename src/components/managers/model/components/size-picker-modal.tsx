import * as DialogPrimitives from '@radix-ui/react-dialog';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { groupSizesByCategory } from './size-categories';

// Reusable modal size selector grouped by category (tops/bottoms/tailored/shoes),
// filtered by the given gender. Used by the model default-sizes field and the
// fitting sizing section. Selection state lives in the caller.
export function SizePickerModal({
  selectedIds,
  onToggle,
  gender,
  triggerLabel = 'select sizes',
  title = 'sizes',
  triggerClassName,
}: {
  selectedIds: number[];
  onToggle: (id: number) => void;
  gender?: string;
  triggerLabel?: string;
  title?: string;
  triggerClassName?: string;
}) {
  const { dictionary } = useDictionary();
  const [open, setOpen] = useState(false);

  const groups = useMemo(
    () => groupSizesByCategory(dictionary?.sizes ?? [], gender),
    [dictionary?.sizes, gender],
  );
  const selected = new Set(selectedIds);

  return (
    <DialogPrimitives.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitives.Trigger asChild>
        <Button type='button' variant='main' className={cn('uppercase', triggerClassName)}>
          {triggerLabel}
          {selectedIds.length ? ` (${selectedIds.length})` : ''}
        </Button>
      </DialogPrimitives.Trigger>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content
          className={cn(
            'fixed z-50 flex flex-col border border-textInactiveColor bg-bgColor text-textColor',
            'inset-x-2 bottom-2 top-2 p-3',
            'lg:inset-x-auto lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:h-[min(85vh,640px)] lg:w-[min(92vw,720px)] lg:-translate-x-1/2 lg:-translate-y-1/2',
          )}
        >
          <div className='flex shrink-0 items-center justify-between border-b border-textColor pb-2'>
            <DialogPrimitives.Title className='text-lg uppercase'>{title}</DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button'>[x]</Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            Select sizes by category
          </DialogPrimitives.Description>

          <Text variant='inactive' size='small' className='py-2'>
            {gender && gender !== 'GENDER_ENUM_UNKNOWN'
              ? 'showing sizes for the selected gender'
              : 'all sizes shown'}
          </Text>

          <div className='min-h-0 flex-1 space-y-5 overflow-y-auto'>
            {groups.length === 0 ? (
              <Text variant='inactive'>no sizes available</Text>
            ) : (
              groups.map((group) => (
                <div key={group.key} className='space-y-2'>
                  <Text variant='uppercase' size='small'>
                    {group.label}
                  </Text>
                  <div className='flex flex-wrap gap-2'>
                    {group.sizes.map((s) => {
                      const id = s.id ?? 0;
                      const on = selected.has(id);
                      return (
                        <button
                          type='button'
                          key={id}
                          onClick={() => onToggle(id)}
                          aria-pressed={on}
                          className={cn(
                            'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                            on
                              ? 'border-textColor bg-textColor text-bgColor'
                              : 'border-textInactiveColor text-textColor hover:border-textColor',
                          )}
                        >
                          {formatSizeName(s.name)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className='flex shrink-0 justify-end border-t border-textInactiveColor pt-3'>
            <DialogPrimitives.Close asChild>
              <Button type='button' variant='main' size='lg' className='uppercase'>
                done
              </Button>
            </DialogPrimitives.Close>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
