import * as DialogPrimitives from '@radix-ui/react-dialog';
import { heroTypes } from 'constants/constants';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { BlockEditor } from './block-editor';
import { HeroSchema } from './schema';
import { ProductSelectionApi } from './useProductSelection';

interface BlockEditorModalProps {
  /** uid of the block being edited, or null when closed. */
  editingUid: string | null;
  onOpenChange: (open: boolean) => void;
  featuredProducts: ProductSelectionApi;
  /** True while editing a freshly-added, unconfirmed block — cancel/close discards it. */
  isNew?: boolean;
  /** Confirm/keep the new block (leaves it in the list). */
  onConfirm?: () => void;
  /** Clone this block (deep copy under a fresh uid); shown for existing blocks. */
  onDuplicate?: (uid: string) => void;
}

/**
 * Click-to-edit modal for a single hero block (phase 4). It resolves the live
 * entity + its current index from `editingUid` via its own watch, so the parent
 * only holds a uid string (no extra per-keystroke re-render there). Edits write
 * straight to the form and stream to the live preview — there is no staged/
 * revert state, so closing just dismisses; the global Save persists.
 */
export function BlockEditorModal({
  editingUid,
  onOpenChange,
  featuredProducts,
  isNew = false,
  onConfirm,
  onDuplicate,
}: BlockEditorModalProps) {
  const { control } = useFormContext<HeroSchema>();
  const entities = (useWatch({ control, name: 'entities' }) || []) as any[];
  const index = editingUid ? entities.findIndex((e) => e?._uid === editingUid) : -1;
  const entity = index >= 0 ? (entities[index] as HeroSchema['entities'][number]) : null;
  const open = index >= 0 && !!entity;
  const typeLabel = entity
    ? heroTypes.find((t) => t.value === entity.type)?.label ?? entity.type
    : '';

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5 text-textColor lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:h-[88vh] lg:w-[92vw] lg:max-w-[1040px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-4'>
          <DialogPrimitives.Title className='sr-only'>
            edit {typeLabel} block
          </DialogPrimitives.Title>
          <DialogPrimitives.Description className='sr-only'>
            edit block fields; changes apply to the live preview
          </DialogPrimitives.Description>
          <div className='flex h-full flex-col gap-3'>
            <div className='flex shrink-0 items-center justify-between border-b border-textColor pb-2'>
              <div className='flex items-center gap-2'>
                {index >= 0 && <Text variant='inactive'>#{index + 1}</Text>}
                <Text variant='uppercase' size='large'>
                  {typeLabel}
                </Text>
              </div>
              <DialogPrimitives.Close asChild>
                <Button type='button' className='cursor-pointer px-2 py-1'>
                  [x]
                </Button>
              </DialogPrimitives.Close>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              {entity && index >= 0 && (
                <BlockEditor index={index} entity={entity} featuredProducts={featuredProducts} />
              )}
            </div>
            <div className='flex shrink-0 justify-end gap-2'>
              {isNew ? (
                <>
                  <DialogPrimitives.Close asChild>
                    <Button type='button' variant='secondary' size='lg' className='cursor-pointer'>
                      cancel
                    </Button>
                  </DialogPrimitives.Close>
                  <Button
                    type='button'
                    variant='main'
                    size='lg'
                    className='cursor-pointer'
                    onClick={onConfirm}
                  >
                    add block
                  </Button>
                </>
              ) : (
                <>
                  {onDuplicate && editingUid && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='lg'
                      className='cursor-pointer'
                      onClick={() => onDuplicate(editingUid)}
                    >
                      duplicate
                    </Button>
                  )}
                  <DialogPrimitives.Close asChild>
                    <Button type='button' variant='main' size='lg' className='cursor-pointer'>
                      done
                    </Button>
                  </DialogPrimitives.Close>
                </>
              )}
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
