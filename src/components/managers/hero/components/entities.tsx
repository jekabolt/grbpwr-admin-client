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
import { common_MediaFull } from 'api/proto-http/admin';
import { heroTypes } from 'constants/constants';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { EntitiesProps } from '../utility/interface';
import { CommonEntity } from './common-entity';
import { FeaturedProductBase } from './featured-prduct-base';
import { HeroSchema } from './schema';
import { SortableEntity } from './sortable-entity';

export const Entities: FC<EntitiesProps> = ({
  entityRefs,
  arrayHelpers,
  featuredProducts,
  deletedIndicesRef,
  onDeletedIndicesChange,
}) => {
  const {
    setValue,
    control,
    formState: { errors },
  } = useFormContext<HeroSchema>();
  const entities = useWatch({ control, name: 'entities' }) || [];
  const [deletedIndices, setDeletedIndices] = useState<Set<string>>(new Set());
  const [collapsedIndices, setCollapsedIndices] = useState<Set<string>>(new Set());
  const prevDeletedIndicesRef = useRef<Set<string>>(new Set());

  // Pointer for mouse/touch (small threshold so header buttons still click),
  // keyboard for a11y (focus handle -> Space to lift -> arrows to move).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const entityErrors = errors.entities as Record<number, unknown> | undefined;

  // Auto-expand any block that has validation errors so they are visible after a failed save.
  useEffect(() => {
    if (!entityErrors) return;
    setCollapsedIndices((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      Object.keys(entityErrors).forEach((key) => {
        const uid = (entities[Number(key)] as any)?._uid;
        if (uid) next.delete(uid);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [entityErrors, entities]);

  const toggleCollapsed = useCallback((uid: string) => {
    setCollapsedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const typeLabel = (type: string) => heroTypes.find((t) => t.value === type)?.label ?? type;

  useEffect(() => {
    deletedIndicesRef.current = deletedIndices;

    const prev = prevDeletedIndicesRef.current;
    if (
      prev.size !== deletedIndices.size ||
      Array.from(prev).some((idx) => !deletedIndices.has(idx)) ||
      Array.from(deletedIndices).some((idx) => !prev.has(idx))
    ) {
      prevDeletedIndicesRef.current = new Set(deletedIndices);
      if (onDeletedIndicesChange) {
        onDeletedIndicesChange();
      }
    }
  }, [deletedIndices, deletedIndicesRef, onDeletedIndicesChange]);

  useEffect(() => {
    const liveUids = new Set(entities.map((e: any) => e._uid));
    setDeletedIndices((prev) => {
      const filtered = new Set<string>();
      prev.forEach((uid) => {
        if (liveUids.has(uid)) {
          filtered.add(uid);
        }
      });
      return filtered;
    });
  }, [entities]);

  const handleSaveMedia = useCallback(
    (
      selectedMedia: common_MediaFull[],
      entityIndex: number,
      type: 'main' | 'single' | 'doubleLeft' | 'doubleRight',
      orientation: 'Portrait' | 'Landscape',
    ) => {
      if (!selectedMedia.length) return;

      const media = selectedMedia[0];
      const thumbnailUrl = media.media?.thumbnail?.mediaUrl || '';

      let idPath: string;
      let urlPath: string;

      if (type === 'doubleLeft' || type === 'doubleRight') {
        const side = type === 'doubleLeft' ? 'left' : 'right';
        idPath = `entities.${entityIndex}.double.${side}.media${orientation}Id`;
        urlPath = `entities.${entityIndex}.double.${side}.media${orientation}Url`;
      } else {
        const entityType = type === 'main' ? 'main' : 'single';
        idPath = `entities.${entityIndex}.${entityType}.media${orientation}Id`;
        urlPath = `entities.${entityIndex}.${entityType}.media${orientation}Url`;
      }

      setValue(idPath as any, media.id, { shouldDirty: true, shouldTouch: true });
      setValue(urlPath as any, thumbnailUrl, { shouldDirty: true, shouldTouch: true });
    },
    [setValue],
  );

  const handleClearMedia = useCallback(
    (
      entityIndex: number,
      type: 'main' | 'single' | 'doubleLeft' | 'doubleRight',
      orientation: 'Portrait' | 'Landscape',
    ) => {
      let idPath: string;
      let urlPath: string;

      if (type === 'doubleLeft' || type === 'doubleRight') {
        const side = type === 'doubleLeft' ? 'left' : 'right';
        idPath = `entities.${entityIndex}.double.${side}.media${orientation}Id`;
        urlPath = `entities.${entityIndex}.double.${side}.media${orientation}Url`;
      } else {
        const entityType = type === 'main' ? 'main' : 'single';
        idPath = `entities.${entityIndex}.${entityType}.media${orientation}Id`;
        urlPath = `entities.${entityIndex}.${entityType}.media${orientation}Url`;
      }

      setValue(idPath as any, undefined, { shouldDirty: true, shouldTouch: true });
      setValue(urlPath as any, '', { shouldDirty: true, shouldTouch: true });
    },
    [setValue],
  );

  const handleSaveProductSelection = useCallback(
    (newProducts: any[], index: number, uid: string) => {
      const productIds = newProducts
        .map((product) => product.id)
        .filter((id): id is number => id !== undefined);

      // form path is positional; display cache is keyed by the stable uid
      setValue(`entities.${index}.featuredProducts.productIds` as any, productIds);
      featuredProducts.saveSelection(newProducts, uid);
      featuredProducts.closeSelection();
    },
    [setValue, featuredProducts],
  );

  const handleRemoveEntity = useCallback((uid: string) => {
    setDeletedIndices((prev) => new Set(prev).add(uid));
  }, []);

  const handleRestoreEntity = useCallback((uid: string) => {
    setDeletedIndices((prev) => {
      const newSet = new Set(prev);
      newSet.delete(uid);
      return newSet;
    });
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = entities.findIndex((e: any) => e._uid === active.id);
    let toIndex = entities.findIndex((e: any) => e._uid === over.id);
    if (fromIndex < 0 || toIndex < 0) return;

    // MAIN is pinned to slot 0 — never let another block land above it.
    const mainPinned = (entities[0] as any)?.type === 'HERO_TYPE_MAIN';
    if (mainPinned && toIndex === 0) toIndex = 1;
    if (fromIndex === toIndex) return;

    arrayHelpers.move(fromIndex, toIndex);
  };

  const renderEntity = (entity: HeroSchema['entities'][number], index: number) => {
    const uid = (entity as any)._uid as string;
    switch (entity.type) {
      case 'HERO_TYPE_MAIN':
        return (
          <CommonEntity
            title='main add'
            prefix={`entities.${index}.main`}
            landscapeLink={entity.main?.mediaLandscapeUrl || ''}
            portraitLink={entity.main?.mediaPortraitUrl || ''}
            aspectRatio={{
              Portrait: ['9:16'],
              Landscape: ['2:1'],
            }}
            onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
              handleSaveMedia(media, index, 'main', orientation)
            }
            onClearMedia={(orientation) => handleClearMedia(index, 'main', orientation)}
          />
        );

      case 'HERO_TYPE_SINGLE':
        return (
          <CommonEntity
            title='single add'
            prefix={`entities.${index}.single`}
            landscapeLink={entity.single?.mediaLandscapeUrl || ''}
            portraitLink={entity.single?.mediaPortraitUrl || ''}
            aspectRatio={{
              Portrait: ['9:16'],
              Landscape: ['2:1'],
            }}
            onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
              handleSaveMedia(media, index, 'single', orientation)
            }
            onClearMedia={(orientation) => handleClearMedia(index, 'single', orientation)}
          />
        );

      case 'HERO_TYPE_DOUBLE':
        return (
          <div className='flex flex-col gap-4'>
            <div className='lg:px-2.5 p-2.5'>
              <Text className='text-xl font-bold leading-none' variant='uppercase'>
                double add
              </Text>
            </div>
            <CommonEntity
              title='left add'
              prefix={`entities.${index}.double.left`}
              landscapeLink={entity.double?.left?.mediaLandscapeUrl || ''}
              portraitLink={entity.double?.left?.mediaPortraitUrl || ''}
              aspectRatio={['1:1']}
              isDoubleAd={true}
              onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
                handleSaveMedia(media, index, 'doubleLeft', orientation)
              }
              onClearMedia={(orientation) => handleClearMedia(index, 'doubleLeft', orientation)}
            />
            <CommonEntity
              title='right add'
              prefix={`entities.${index}.double.right`}
              landscapeLink={entity.double?.right?.mediaLandscapeUrl || ''}
              portraitLink={entity.double?.right?.mediaPortraitUrl || ''}
              aspectRatio={['1:1']}
              isDoubleAd
              onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
                handleSaveMedia(media, index, 'doubleRight', orientation)
              }
              onClearMedia={(orientation) => handleClearMedia(index, 'doubleRight', orientation)}
            />
          </div>
        );

      case 'HERO_TYPE_FEATURED_PRODUCTS':
        return (
          <FeaturedProductBase
            index={index}
            uid={uid}
            entity={entity}
            product={featuredProducts.products}
            currentEntityUid={featuredProducts.currentUid}
            isModalOpen={featuredProducts.isOpen}
            showProductPicker={true}
            title='featured products'
            prefix='featuredProducts'
            handleOpenProductSelection={featuredProducts.openSelection}
            handleCloseModal={featuredProducts.closeSelection}
            handleSaveNewSelection={handleSaveProductSelection}
            handleProductsReorder={featuredProducts.reorderProducts}
          />
        );

      case 'HERO_TYPE_FEATURED_PRODUCTS_TAG':
        return (
          <FeaturedProductBase
            index={index}
            uid={uid}
            entity={entity}
            product={{}}
            title='featured products tag'
            prefix='featuredProductsTag'
          />
        );

      default:
        return null;
    }
  };

  return (
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
        <div className='space-y-6'>
          {entities.map((entity, index) => {
            const uid = (entity as any)._uid as string;
            const isDeleted = deletedIndices.has(uid);
            const isMain = entity.type === 'HERO_TYPE_MAIN';
            const isCollapsed = collapsedIndices.has(uid);
            const hasError = !!entityErrors?.[index];

            return (
              <SortableEntity key={uid} uid={uid} disabled={isDeleted || isMain}>
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
                        className='border-2 border-dashed border-textInactiveColor relative'
                      >
                        <div className='p-4 flex items-center justify-between'>
                          <Text variant='inactive'>entity marked for deletion</Text>
                          <Button
                            variant='secondary'
                            size='lg'
                            className='cursor-pointer'
                            onClick={() => handleRestoreEntity(uid)}
                          >
                            restore
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      ref={setRefs}
                      style={style}
                      className='border-2 border-textColor scroll-mt-4 bg-bgColor'
                    >
                      <div className='flex items-center justify-between gap-2 border-b border-textColor px-3 py-2'>
                        <div className='flex items-center gap-2'>
                          {isMain ? (
                            <span
                              className='px-1 leading-none text-textInactiveColor select-none'
                              title='pinned to top'
                              aria-label='pinned to top'
                            >
                              ⇈
                            </span>
                          ) : (
                            <button
                              type='button'
                              className='px-1 leading-none cursor-grab touch-none select-none text-textInactiveColor hover:text-textColor active:cursor-grabbing'
                              aria-label='drag to reorder block'
                              {...dragHandleProps}
                            >
                              ⠿
                            </button>
                          )}
                          <Text variant='inactive'>#{index + 1}</Text>
                          <Text variant='uppercase'>{typeLabel(entity.type)}</Text>
                          {hasError && (
                            <span className='inline-block px-1.5 py-0.5 bg-error text-bgColor'>
                              <Text className='!text-bgColor' size='small'>
                                incomplete
                              </Text>
                            </span>
                          )}
                        </div>
                        <div className='flex items-center gap-2'>
                          <Button
                            variant='secondary'
                            className='py-1 px-2 cursor-pointer'
                            onClick={() => toggleCollapsed(uid)}
                          >
                            {isCollapsed ? 'expand' : 'collapse'}
                          </Button>
                          <Button
                            variant='main'
                            className='py-1 px-2 cursor-pointer'
                            onClick={() => handleRemoveEntity(uid)}
                          >
                            [x]
                          </Button>
                        </div>
                      </div>

                      {!isCollapsed && <div>{renderEntity(entity, index)}</div>}
                    </div>
                  );
                }}
              </SortableEntity>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
};
