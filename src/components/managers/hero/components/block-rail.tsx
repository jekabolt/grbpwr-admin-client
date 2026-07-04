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
import { heroTypes } from 'constants/constants';
import { cn } from 'lib/utility';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { HeroSchema } from './schema';
import { SortableEntity } from './sortable-entity';

// Primary headline (default language, id 1) for a block's copy, if any.
function translationHeadline(translations: any[] | undefined): string | undefined {
  if (!Array.isArray(translations)) return undefined;
  const t = translations.find((x) => x?.languageId === 1) || translations[0];
  return (t?.headline || t?.caption || t?.tag || '').trim() || undefined;
}

// A tiny thumbnail url + one-line summary per block so rows are distinguishable
// at a glance instead of showing only the type label. Reads the form's flat
// media urls (thumbnails) and copy; both are already in the watched entity.
function blockPreview(entity: any): { thumb?: string; summary?: string } {
  const e = entity;
  const firstMedia = (s: any) => s?.mediaLandscapeUrl || s?.mediaPortraitUrl || undefined;
  switch (e?.type) {
    case 'HERO_TYPE_MAIN':
      return { thumb: firstMedia(e.main), summary: translationHeadline(e.main?.translations) };
    case 'HERO_TYPE_SINGLE':
      return { thumb: firstMedia(e.single), summary: translationHeadline(e.single?.translations) };
    case 'HERO_TYPE_DOUBLE':
      return {
        thumb: firstMedia(e.double?.left) || firstMedia(e.double?.right),
        summary: translationHeadline(e.double?.left?.translations),
      };
    case 'HERO_TYPE_STATEMENT':
      return {
        thumb: firstMedia(e.statement),
        summary: translationHeadline(e.statement?.translations),
      };
    case 'HERO_TYPE_NEWSLETTER':
      return {
        thumb: firstMedia(e.newsletter),
        summary: translationHeadline(e.newsletter?.translations),
      };
    case 'HERO_TYPE_EMBED':
      return { thumb: firstMedia(e.embed), summary: translationHeadline(e.embed?.translations) };
    case 'HERO_TYPE_DROP':
      return { thumb: firstMedia(e.drop), summary: translationHeadline(e.drop?.translations) };
    case 'HERO_TYPE_SPLIT':
      return {
        thumb: firstMedia(e.split?.media),
        summary: translationHeadline(e.split?.media?.translations),
      };
    case 'HERO_TYPE_PRODUCT_SPOTLIGHT':
      return {
        thumb: firstMedia(e.productSpotlight),
        summary: translationHeadline(e.productSpotlight?.translations),
      };
    case 'HERO_TYPE_VIDEO':
      return {
        thumb: e.video?.posterUrl || e.video?.mediaUrl || undefined,
        summary: translationHeadline(e.video?.translations),
      };
    case 'HERO_TYPE_SLIDESHOW':
      return {
        thumb: firstMedia(e.slideshow?.slides?.[0]),
        summary: e.slideshow?.slides?.length ? `${e.slideshow.slides.length} slides` : undefined,
      };
    case 'HERO_TYPE_MOSAIC':
      return {
        thumb: firstMedia(e.mosaic?.tiles?.[0]),
        summary: e.mosaic?.tiles?.length ? `${e.mosaic.tiles.length} tiles` : undefined,
      };
    case 'HERO_TYPE_LOOKBOOK':
      return {
        thumb: firstMedia(e.lookbook?.frames?.[0]),
        summary: e.lookbook?.frames?.length
          ? `${e.lookbook.frames.length} frames`
          : translationHeadline(e.lookbook?.translations),
      };
    case 'HERO_TYPE_MARQUEE':
      return { summary: translationHeadline(e.marquee?.translations) };
    case 'HERO_TYPE_FEATURED_PRODUCTS':
      return { summary: translationHeadline(e.featuredProducts?.translations) };
    case 'HERO_TYPE_FEATURED_PRODUCTS_TAG':
      return {
        summary: e.featuredProductsTag?.tag
          ? `#${e.featuredProductsTag.tag}`
          : translationHeadline(e.featuredProductsTag?.translations),
      };
    case 'HERO_TYPE_LAST_CHANCE':
      return { summary: translationHeadline(e.lastChance?.translations) };
    case 'HERO_TYPE_NEW_ARRIVALS':
      return { summary: translationHeadline(e.newArrivals?.translations) };
    default:
      return {};
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
 * Slim overview rail (phase 4): one compact row per hero block. Reorder by DnD
 * (Phase 1), click a row to edit it in the modal, delete/restore, and see
 * "incomplete" at a glance. The block editors themselves live in the modal, so
 * the preview keeps the rest of the viewport.
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
  } = useFormContext<HeroSchema>();
  const entities = useWatch({ control, name: 'entities' }) || [];
  const [deletedIndices, setDeletedIndices] = useState<Set<string>>(new Set());
  const prevDeletedIndicesRef = useRef<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const entityErrors = errors.entities as Record<number, unknown> | undefined;
  const typeLabel = (type: string) => heroTypes.find((t) => t.value === type)?.label ?? type;

  // Short badge for the TARGETING modifier; empty for "everyone" (ALL/unset).
  const audienceBadge = (entity: any): string => {
    switch (entity?.audience) {
      case 'HERO_AUDIENCE_GUESTS':
        return 'guests';
      case 'HERO_AUDIENCE_MEMBERS':
        return 'members';
      case 'HERO_AUDIENCE_TIER':
        return entity?.minTierId ? `tier ${entity.minTierId}+` : 'tier';
      default:
        return '';
    }
  };

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
    const liveUids = new Set(entities.map((e: any) => e._uid));
    setDeletedIndices((prev) => {
      const filtered = new Set<string>();
      prev.forEach((uid) => {
        if (liveUids.has(uid)) filtered.add(uid);
      });
      return filtered;
    });
  }, [entities]);

  const handleRemoveEntity = useCallback((uid: string) => {
    setDeletedIndices((prev) => new Set(prev).add(uid));
  }, []);

  const handleRestoreEntity = useCallback((uid: string) => {
    setDeletedIndices((prev) => {
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = entities.findIndex((e: any) => e._uid === active.id);
    const toIndex = entities.findIndex((e: any) => e._uid === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex === toIndex) return;
    arrayHelpers.move(fromIndex, toIndex);
  };

  const liveCount = entities.filter((e: any) => !deletedIndices.has(e._uid)).length;

  return (
    <div className='flex flex-col gap-2'>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={entities.map((e: any) => e._uid)}
          strategy={verticalListSortingStrategy}
        >
          <div className='flex flex-col gap-1.5'>
            {entities.map((entity, index) => {
              const uid = (entity as any)._uid as string;
              const isDeleted = deletedIndices.has(uid);
              const isSelected = selectedUid === uid;
              const hasError = !!entityErrors?.[index];
              const preview = blockPreview(entity);

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
                            onClick={() => handleRestoreEntity(uid)}
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
                            ? 'border-2 border-textColor'
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
                                {typeLabel(entity.type)}
                              </Text>
                              {audienceBadge(entity) && (
                                <span
                                  className='shrink-0 border border-textInactiveColor px-1 leading-none text-textInactiveColor'
                                  title='audience-restricted'
                                >
                                  <Text size='small' variant='uppercase'>
                                    {audienceBadge(entity)}
                                  </Text>
                                </span>
                              )}
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
                          onClick={() => handleRemoveEntity(uid)}
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
