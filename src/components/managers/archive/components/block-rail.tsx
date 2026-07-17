import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { common_Colorway } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { SortableEntity } from '../../hero/components/sortable-entity';
import { ARCHIVE_ITEM_TYPE_LABEL } from './item-types';
import { ArchiveFormData } from './schema';

// Default-language (id 1) copy string for a block, if any.
function defaultCopy(translations: any[] | undefined, key: 'caption' | 'text'): string | undefined {
  if (!Array.isArray(translations)) return undefined;
  const t = translations.find((x) => x?.languageId === 1) || translations[0];
  return (t?.[key] || '').trim() || undefined;
}

// A tiny thumbnail url + one-line summary per block, so rows are distinguishable
// at a glance instead of only showing the type label.
// A9: PRODUCT/PRODUCTS_MANUAL now resolve a real thumbnail from the resolved
// product cache (keyed by block uid, same cache the picker/preview use) instead of
// always falling through to the generic dashed placeholder. PRODUCTS_TAG isn't
// resolved here (that would mean a live lookup per rail row for every tag block);
// its live match preview lives in the block editor itself (A4).
function itemPreview(
  item: any,
  products: Record<string, common_Colorway[]>,
): { thumb?: string; summary?: string } {
  switch (item?.type) {
    case 'ARCHIVE_ITEM_TYPE_MAIN_MEDIA':
      return { thumb: item.mediaUrl || undefined, summary: 'main media' };
    case 'ARCHIVE_ITEM_TYPE_MEDIA_LINE': {
      const n = item.mediaIds?.length || 0;
      return { thumb: item.mediaUrls?.[0] || undefined, summary: `${n} media` };
    }
    case 'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION':
      return {
        thumb: item.mediaUrl || undefined,
        summary: defaultCopy(item.translations, 'caption') || 'media + caption',
      };
    case 'ARCHIVE_ITEM_TYPE_TEXT':
      return { summary: defaultCopy(item.translations, 'text') };
    case 'ARCHIVE_ITEM_TYPE_EMBED':
      return { summary: item.embedUrl || defaultCopy(item.translations, 'caption') };
    case 'ARCHIVE_ITEM_TYPE_PRODUCT':
      return {
        thumb: products[item._uid]?.[0]?.display?.thumbnail?.media?.thumbnail?.mediaUrl,
        summary: defaultCopy(item.translations, 'caption') || 'product',
      };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG':
      return {
        summary: item.tag ? `#${item.tag}` : defaultCopy(item.translations, 'caption'),
      };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL':
      return {
        thumb: products[item._uid]?.[0]?.display?.thumbnail?.media?.thumbnail?.mediaUrl,
        summary: item.productIds?.length
          ? `${item.productIds.length} product${item.productIds.length === 1 ? '' : 's'}`
          : defaultCopy(item.translations, 'caption'),
      };
    default:
      return {};
  }
}

interface BlockRailProps {
  entityRefs: React.MutableRefObject<{ [uid: string]: HTMLDivElement | null }>;
  arrayHelpers: { move: (from: number, to: number) => void };
  deletedIndicesRef: React.MutableRefObject<Set<string>>;
  onDeletedIndicesChange?: () => void;
  onSelectBlock: (uid: string) => void;
  selectedUid: string | null;
  onAddClick: () => void;
  /** Resolved product cache keyed by block uid, for PRODUCT/PRODUCTS_MANUAL thumbnails. */
  products?: Record<string, common_Colorway[]>;
}

/**
 * Slim overview rail for the archive body: one compact row per block. Reorder by
 * DnD, click a row to edit it in the modal, delete/restore, and see "incomplete"
 * at a glance. Ported from the hero BlockRail (no audience/targeting badge).
 */
export const BlockRail: FC<BlockRailProps> = ({
  entityRefs,
  arrayHelpers,
  deletedIndicesRef,
  onDeletedIndicesChange,
  onSelectBlock,
  selectedUid,
  onAddClick,
  products = {},
}) => {
  const {
    control,
    formState: { errors },
  } = useFormContext<ArchiveFormData>();
  const items = (useWatch({ control, name: 'items' }) || []) as any[];
  const [deletedIndices, setDeletedIndices] = useState<Set<string>>(new Set());
  const prevDeletedIndicesRef = useRef<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const itemErrors = errors.items as Record<number, unknown> | undefined;

  useEffect(() => {
    deletedIndicesRef.current = deletedIndices;
    const prev = prevDeletedIndicesRef.current;
    if (
      prev.size !== deletedIndices.size ||
      Array.from(prev).some((idx) => !deletedIndices.has(idx)) ||
      Array.from(deletedIndices).some((idx) => !prev.has(idx))
    ) {
      prevDeletedIndicesRef.current = new Set(deletedIndices);
      onDeletedIndicesChange?.();
    }
  }, [deletedIndices, deletedIndicesRef, onDeletedIndicesChange]);

  useEffect(() => {
    const liveUids = new Set(items.map((e: any) => e._uid));
    setDeletedIndices((prev) => {
      const filtered = new Set<string>();
      prev.forEach((uid) => {
        if (liveUids.has(uid)) filtered.add(uid);
      });
      return filtered;
    });
  }, [items]);

  const handleRemove = useCallback((uid: string) => {
    setDeletedIndices((prev) => new Set(prev).add(uid));
  }, []);

  const handleRestore = useCallback((uid: string) => {
    setDeletedIndices((prev) => {
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = items.findIndex((e: any) => e._uid === active.id);
    const toIndex = items.findIndex((e: any) => e._uid === over.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    arrayHelpers.move(fromIndex, toIndex);
  };

  const liveCount = items.filter((e: any) => !deletedIndices.has(e._uid)).length;

  return (
    <div className='flex flex-col gap-2'>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((e: any) => e._uid)}
          strategy={verticalListSortingStrategy}
        >
          <div className='flex flex-col gap-1.5'>
            {items.map((item, index) => {
              const uid = item._uid as string;
              const isDeleted = deletedIndices.has(uid);
              const isSelected = selectedUid === uid;
              const hasError = !!itemErrors?.[index];
              const preview = itemPreview(item, products);

              return (
                <SortableEntity key={uid} uid={uid} disabled={isDeleted}>
                  {({ setNodeRef, style, dragHandleProps }) => {
                    const setRefs = (el: HTMLDivElement | null) => {
                      setNodeRef(el);
                      entityRefs.current[uid] = el;
                    };

                    if (isDeleted) {
                      return (
                        <div
                          ref={setRefs}
                          style={style}
                          className='flex items-center justify-between gap-2 border border-dashed border-textInactiveColor px-2 py-1.5'
                        >
                          <Text variant='inactive' size='small'>
                            #{index + 1} deleted
                          </Text>
                          <button
                            type='button'
                            className='cursor-pointer px-1 py-0.5 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                            onClick={() => handleRestore(uid)}
                          >
                            <Text size='small'>restore</Text>
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div
                        ref={setRefs}
                        style={style}
                        className={cn(
                          'flex items-center gap-1.5 bg-bgColor px-1.5 py-1.5 scroll-mt-4',
                          isSelected
                            ? 'border-2 border-textInactiveColor'
                            : 'border border-textInactiveColor',
                        )}
                      >
                        <button
                          type='button'
                          className='flex items-center px-1.5 py-1 leading-none cursor-grab touch-none select-none text-textInactiveColor hover:text-textColor active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                          aria-label='drag to reorder block'
                          {...dragHandleProps}
                        >
                          ⠿
                        </button>
                        <button
                          type='button'
                          onClick={() => onSelectBlock(uid)}
                          className='flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                        >
                          {preview.thumb ? (
                            <img
                              src={preview.thumb}
                              alt=''
                              className='h-8 w-8 shrink-0 border border-textInactiveColor object-cover'
                            />
                          ) : (
                            <div className='h-8 w-8 shrink-0 border border-dashed border-textInactiveColor' />
                          )}
                          <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                            <span className='flex items-center gap-1.5'>
                              <Text variant='inactive' size='small'>
                                #{index + 1}
                              </Text>
                              <Text variant='uppercase' size='small' className='truncate'>
                                {ARCHIVE_ITEM_TYPE_LABEL[item.type] ?? item.type}
                              </Text>
                              {hasError && (
                                <span
                                  className='ml-auto inline-block bg-error px-1 leading-none text-bgColor'
                                  title='incomplete'
                                  aria-label='incomplete'
                                >
                                  <Text className='!text-bgColor' size='small'>
                                    !
                                  </Text>
                                </span>
                              )}
                            </span>
                            {preview.summary && (
                              <Text variant='label' size='small' className='truncate'>
                                {preview.summary}
                              </Text>
                            )}
                          </span>
                        </button>
                        <button
                          type='button'
                          className='flex items-center px-1.5 py-1 leading-none cursor-pointer text-textInactiveColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                          aria-label='delete block'
                          onClick={() => handleRemove(uid)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  }}
                </SortableEntity>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {liveCount === 0 && (
        <div className='border border-dashed border-textInactiveColor px-3 py-6 text-center'>
          <Text variant='label' size='small' className='leading-snug'>
            no blocks yet. add media, text, or products below to build the entry.
          </Text>
        </div>
      )}

      <Button
        type='button'
        variant='main'
        size='lg'
        className='w-full cursor-pointer uppercase'
        onClick={onAddClick}
      >
        + add block
      </Button>
    </div>
  );
};
