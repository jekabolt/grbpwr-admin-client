import * as DialogPrimitives from '@radix-ui/react-dialog';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ModelFormData } from './schema';
import { groupSizesByCategory } from './size-categories';

// Multi-select of default sample sizes, opened in a modal and split by category
// (tops / bottoms / tailored / shoes). Options are filtered by the model's gender.
export function DefaultSizesField() {
  const { control } = useFormContext<ModelFormData>();
  const { field } = useController({ control, name: 'defaultSizeIds' });
  const gender = useWatch({ control, name: 'gender' }) as string;
  const { dictionary } = useDictionary();
  const [open, setOpen] = useState(false);

  const allSizes = useMemo(() => dictionary?.sizes ?? [], [dictionary?.sizes]);
  const groups = useMemo(
    () => groupSizesByCategory(allSizes, gender),
    [allSizes, gender],
  );
  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of allSizes) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [allSizes]);

  const selectedIds = field.value ?? [];
  const selected = new Set(selectedIds);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    field.onChange([...next]);
  };
  const remove = (id: number) => field.onChange(selectedIds.filter((x) => x !== id));

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='inactive' size='small'>
          default sizes (optional, multiple)
        </Text>
        <DialogPrimitives.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitives.Trigger asChild>
            <Button type='button' variant='main' className='uppercase'>
              select sizes{selectedIds.length ? ` (${selectedIds.length})` : ''}
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
                <DialogPrimitives.Title className='text-lg uppercase'>
                  default sizes
                </DialogPrimitives.Title>
                <DialogPrimitives.Close asChild>
                  <Button type='button'>[x]</Button>
                </DialogPrimitives.Close>
              </div>
              <DialogPrimitives.Description className='sr-only'>
                Select the model's default sample sizes by category
              </DialogPrimitives.Description>

              <Text variant='inactive' size='small' className='py-2'>
                {gender && gender !== 'GENDER_ENUM_UNKNOWN'
                  ? 'showing sizes for the selected gender'
                  : 'tip: set the model gender to narrow gendered sizes'}
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
                              onClick={() => toggle(id)}
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
