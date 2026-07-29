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
import { emailBlockTypes } from 'constants/email-campaign';
import { cn } from 'lib/utility';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { CampaignSchema } from './schema';
import { SortableEntity } from './sortable-entity';

// Default-language (id 1) translation for a block, if any.
function firstTranslation(translations: any[] | undefined): any {
  if (!Array.isArray(translations)) return undefined;
  return translations.find((t) => t?.languageId === 1) || translations[0];
}

function stripHtml(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// One-line summary per block so rows are distinguishable at a glance. Email blocks
// carry no flat media URL in the form (media is addressed by id), so there is no
// thumbnail — the summary does the work.
function blockSummary(block: any): string | undefined {
  const t = firstTranslation(block?.translations);
  switch (block?.type) {
    case 'EMAIL_BLOCK_TYPE_HEADER':
      return (t?.heading || t?.preheader || '').trim() || undefined;
    case 'EMAIL_BLOCK_TYPE_IMAGE_LINK':
      return (t?.caption || block.imageLink?.url || '').trim() || undefined;
    case 'EMAIL_BLOCK_TYPE_RICH_TEXT':
      return stripHtml(t?.body) || undefined;
    case 'EMAIL_BLOCK_TYPE_PRODUCT_CARD':
      return block.productCard?.productId ? `product #${block.productCard.productId}` : undefined;
    case 'EMAIL_BLOCK_TYPE_PRODUCT_GRID':
      return block.productGrid?.productIds?.length
        ? `${block.productGrid.productIds.length} products`
        : (t?.heading || '').trim() || undefined;
    case 'EMAIL_BLOCK_TYPE_CTA_BUTTON':
      return (t?.ctaLabel || '').trim() || undefined;
    case 'EMAIL_BLOCK_TYPE_DIVIDER':
      return 'divider';
    case 'EMAIL_BLOCK_TYPE_SPACER':
      return block.spacer?.height ? `${block.spacer.height}px gap` : 'spacer';
    case 'EMAIL_BLOCK_TYPE_TWO_COLUMN':
      return `${block.twoColumn?.left?.length ?? 0} / ${block.twoColumn?.right?.length ?? 0} blocks`;
    case 'EMAIL_BLOCK_TYPE_SOCIAL_LINKS':
      return block.socialLinks?.links?.length
        ? `${block.socialLinks.links.length} links`
        : undefined;
    case 'EMAIL_BLOCK_TYPE_COUNTDOWN':
      return (t?.heading || '').trim() || undefined;
    case 'EMAIL_BLOCK_TYPE_VIDEO_THUMB':
      return (t?.caption || block.videoThumb?.videoUrl || '').trim() || undefined;
    default:
      return undefined;
  }
}

interface BlockRailProps {
  entityRefs: React.MutableRefObject<{ [uid: string]: HTMLDivElement | null }>;
  arrayHelpers: { move: (from: number, to: number) => void };
  deletedIndicesRef: React.MutableRefObject<Set<string>>;
  onDeletedIndicesChange?: () => void;
  /** Open a block's editor modal. */
  onSelectBlock: (uid: string) => void;
  /** uid whose editor modal is open (highlighted). */
  selectedUid: string | null;
  /** Open the add-block palette. */
  onAddClick: () => void;
}

/**
 * Slim overview rail: one compact row per email block. Reorder by DnD, click a
 * row to edit it in the modal, soft-delete / restore, and see "incomplete" at a
 * glance. Fork of hero/components/block-rail.tsx, minus the audience badge.
 */
export const BlockRail: FC<BlockRailProps> = ({
  entityRefs,
  arrayHelpers,
  deletedIndicesRef,
  onDeletedIndicesChange,
  onSelectBlock,
  selectedUid,
  onAddClick,
}) => {
  const {
    control,
    formState: { errors },
  } = useFormContext<CampaignSchema>();
  const blocks = (useWatch({ control, name: 'body' }) || []) as any[];
  const [deletedIndices, setDeletedIndices] = useState<Set<string>>(new Set());
  const prevDeletedIndicesRef = useRef<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const blockErrors = errors.body as Record<number, unknown> | undefined;
  const typeLabel = (type: string) => emailBlockTypes.find((t) => t.value === type)?.label ?? type;

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
    const liveUids = new Set(blocks.map((b: any) => b._uid));
    setDeletedIndices((prev) => {
      const filtered = new Set<string>();
      prev.forEach((uid) => {
        if (liveUids.has(uid)) filtered.add(uid);
      });
      return filtered;
    });
  }, [blocks]);

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
    const fromIndex = blocks.findIndex((b: any) => b._uid === active.id);
    const toIndex = blocks.findIndex((b: any) => b._uid === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex === toIndex) return;
    arrayHelpers.move(fromIndex, toIndex);
  };

  const liveCount = blocks.filter((b: any) => !deletedIndices.has(b._uid)).length;

  return (
    <div className='flex flex-col gap-2'>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blocks.map((b: any) => b._uid)}
          strategy={verticalListSortingStrategy}
        >
          <div className='flex flex-col gap-1.5'>
            {blocks.map((block, index) => {
              const uid = block._uid as string;
              const isDeleted = deletedIndices.has(uid);
              const isSelected = selectedUid === uid;
              const hasError = !!blockErrors?.[index];
              const summary = blockSummary(block);

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
                          <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                            <span className='flex items-center gap-1.5'>
                              <Text variant='inactive' size='small'>
                                #{index + 1}
                              </Text>
                              <Text variant='uppercase' size='small' className='truncate'>
                                {typeLabel(block.type)}
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
                            {summary && (
                              <Text variant='label' size='small' className='truncate'>
                                {summary}
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
        <Text variant='label' size='small' className='px-1 py-2'>
          no blocks yet — add your first one below
        </Text>
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
