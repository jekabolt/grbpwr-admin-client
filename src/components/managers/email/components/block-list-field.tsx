import * as DialogPrimitives from '@radix-ui/react-dialog';
import { emailBlockTypes } from 'constants/email-campaign';
import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ProductSelectionApi } from '../../hero/components/useProductSelection';
import { BlockEditor } from './block-editor';
import { CampaignSchema } from './schema';
import { SelectEmailType } from './selectEmailType';

interface BlockListFieldProps {
  /** Path to the TWO_COLUMN payload, e.g. `body.3.twoColumn`. */
  prefix: string;
  side: 'left' | 'right';
  featuredProducts: ProductSelectionApi;
}

/**
 * Nested reorderable EmailBlock[] editor for a TWO_COLUMN column. Each child is
 * edited inline via <BlockEditor> at `${prefix}.${side}.${i}`; the add-block
 * picker excludes TWO_COLUMN so the tree can't recurse infinitely. Adapts hero's
 * slide-list-field.tsx.
 */
export function BlockListField({ prefix, side, featuredProducts }: BlockListFieldProps) {
  const { control } = useFormContext<CampaignSchema>();
  const name = `${prefix}.${side}`;
  const fa = useFieldArray({ control, name: name as any });
  const items = (useWatch({ control, name: name as any }) || []) as any[];
  const [addOpen, setAddOpen] = useState(false);

  const typeLabel = (t: string) => emailBlockTypes.find((x) => x.value === t)?.label ?? t;

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <Text variant='uppercase' size='small'>
        {side} column
      </Text>

      {items.length === 0 && (
        <Text variant='label' size='small'>
          no blocks in this column yet
        </Text>
      )}

      {fa.fields.map((f, i) => {
        const child = items[i];
        return (
          <div key={f.id} className='border border-textInactiveColor'>
            <div className='flex items-center justify-between gap-2 border-b border-textInactiveColor px-2 py-1'>
              <Text variant='uppercase' size='small' className='truncate'>
                #{i + 1} {typeLabel(child?.type)}
              </Text>
              <div className='flex items-center gap-1'>
                <button
                  type='button'
                  aria-label='move up'
                  disabled={i === 0}
                  onClick={() => fa.move(i, i - 1)}
                  className='px-1.5 leading-none text-textInactiveColor hover:text-textColor disabled:opacity-30'
                >
                  ↑
                </button>
                <button
                  type='button'
                  aria-label='move down'
                  disabled={i === items.length - 1}
                  onClick={() => fa.move(i, i + 1)}
                  className='px-1.5 leading-none text-textInactiveColor hover:text-textColor disabled:opacity-30'
                >
                  ↓
                </button>
                <button
                  type='button'
                  aria-label='delete block'
                  onClick={() => fa.remove(i)}
                  className='px-1.5 leading-none text-textInactiveColor hover:text-textColor'
                >
                  ×
                </button>
              </div>
            </div>
            <div className='p-2'>
              {child && (
                <BlockEditor
                  prefix={`${name}.${i}`}
                  block={child}
                  featuredProducts={featuredProducts}
                />
              )}
            </div>
          </div>
        );
      })}

      <Button
        type='button'
        variant='secondary'
        className='w-full px-2 py-1 uppercase'
        onClick={() => setAddOpen(true)}
      >
        + add to {side}
      </Button>

      <DialogPrimitives.Root open={addOpen} onOpenChange={setAddOpen}>
        <DialogPrimitives.Portal>
          <DialogPrimitives.Overlay className='fixed inset-0 z-[60] h-screen bg-overlay' />
          <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-[60] flex flex-col overflow-y-auto border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5 text-textColor lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:h-[80vh] lg:w-[90vw] lg:max-w-[800px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-4'>
            <DialogPrimitives.Title className='mb-3 shrink-0'>
              <Text variant='uppercase' size='large'>
                add to {side} column
              </Text>
            </DialogPrimitives.Title>
            <DialogPrimitives.Description className='sr-only'>
              pick a block type to append to the {side} column (two-column blocks are not allowed
              inside a column)
            </DialogPrimitives.Description>
            <SelectEmailType
              append={fa.append}
              excludeTypes={['EMAIL_BLOCK_TYPE_TWO_COLUMN']}
              onAdded={() => setAddOpen(false)}
            />
          </DialogPrimitives.Content>
        </DialogPrimitives.Portal>
      </DialogPrimitives.Root>
    </div>
  );
}
