import * as DialogPrimitives from '@radix-ui/react-dialog';
import { useEffect, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ProductSelectionApi } from '../../hero/components/useProductSelection';
import { BlockEditor } from './block-editor';
import { ARCHIVE_ITEM_TYPE_LABEL } from './item-types';
import { ArchiveFormData } from './schema';

// True if a block has user-entered content worth guarding against an accidental
// Esc / click-outside discard. Seeded-empty translation strings and the
// type/_uid/languageId keys don't count.
function hasContent(item: any): boolean {
  const scan = (v: any): boolean => {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'number') return true;
    if (typeof v === 'boolean') return false;
    if (Array.isArray(v)) return v.some(scan);
    if (typeof v === 'object') {
      return Object.entries(v).some(([k, val]) =>
        k === 'languageId' || k === '_uid' || k === 'type' ? false : scan(val),
      );
    }
    return false;
  };
  if (!item) return false;
  return Object.entries(item).some(([k, val]) =>
    k === 'type' || k === '_uid' ? false : scan(val),
  );
}

interface BlockEditorModalProps {
  editingUid: string | null;
  onOpenChange: (open: boolean) => void;
  productApi: ProductSelectionApi;
  isNew?: boolean;
  onConfirm?: () => void;
  onDuplicate?: (uid: string) => void;
}

/**
 * Click-to-edit modal for a single archive body block. Resolves the live item +
 * its index from `editingUid` via its own watch, so the parent only holds a uid
 * string. Edits write straight to the form and stream to the live preview.
 * Mirrors the hero BlockEditorModal.
 */
export function BlockEditorModal({
  editingUid,
  onOpenChange,
  productApi,
  isNew = false,
  onConfirm,
  onDuplicate,
}: BlockEditorModalProps) {
  const { control } = useFormContext<ArchiveFormData>();
  const items = (useWatch({ control, name: 'items' }) || []) as any[];
  const index = editingUid ? items.findIndex((e) => e?._uid === editingUid) : -1;
  const item = index >= 0 ? items[index] : null;
  const open = index >= 0 && !!item;
  const typeLabel = item ? ARCHIVE_ITEM_TYPE_LABEL[item.type] ?? item.type : '';

  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editingUid) contentRef.current?.scrollTo({ top: 0 });
  }, [editingUid]);

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content
          className='fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5 text-textColor lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:h-[88vh] lg:w-[92vw] lg:max-w-[1040px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-4'
          onEscapeKeyDown={(e) => {
            if (isNew && hasContent(item)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (isNew && hasContent(item)) e.preventDefault();
          }}
        >
          <DialogPrimitives.Title className='sr-only'>
            edit {typeLabel} block
          </DialogPrimitives.Title>
          <DialogPrimitives.Description className='sr-only'>
            edit block fields; changes apply to the live preview
          </DialogPrimitives.Description>
          <div className='flex h-full flex-col gap-3'>
            <div className='flex shrink-0 items-center justify-between border-b border-textInactiveColor pb-2'>
              <div className='flex items-center gap-2'>
                {index >= 0 && <Text variant='label'>#{index + 1}</Text>}
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
            <div ref={contentRef} className='min-h-0 flex-1 overflow-y-auto'>
              {item && index >= 0 && (
                <BlockEditor index={index} item={item} productApi={productApi} />
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
