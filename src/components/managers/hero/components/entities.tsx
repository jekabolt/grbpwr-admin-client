import { common_MediaFull } from 'api/proto-http/admin';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { EntitiesProps } from '../utility/interface';
import { CommonEntity } from './common-entity';
import { FeaturedProductBase } from './featured-prduct-base';
import { HeroSchema } from './schema';
import { useEntityMedia } from './useEntityMedia';
import { useProductSelection } from './useProductSelection';

export const Entities: FC<EntitiesProps> = ({
  entityRefs,
  initialProducts,
  deletedIndicesRef,
  onDeletedIndicesChange,
}) => {
  const { setValue, control } = useFormContext<HeroSchema>();
  const entities = useWatch({ control, name: 'entities' }) || [];
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());
  const prevDeletedIndicesRef = useRef<Set<number>>(new Set());

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
    setDeletedIndices((prev) => {
      const filtered = new Set<number>();
      prev.forEach((index) => {
        if (index < entities.length) {
          filtered.add(index);
        }
      });
      return filtered;
    });
  }, [entities.length]);

  const mediaUrls = useEntityMedia(entities);
  const featuredProducts = useProductSelection(initialProducts);

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

  const handleSaveProductSelection = useCallback(
    (newProducts: any[], index: number) => {
      const productIds = newProducts
        .map((product) => product.id)
        .filter((id): id is number => id !== undefined);

      setValue(`entities.${index}.featuredProducts.productIds` as any, productIds);
      featuredProducts.saveSelection(newProducts, index);
      featuredProducts.closeSelection();
    },
    [setValue, featuredProducts],
  );

  const handleRemoveEntity = useCallback((index: number) => {
    setDeletedIndices((prev) => new Set(prev).add(index));
  }, []);

  const handleRestoreEntity = useCallback((index: number) => {
    setDeletedIndices((prev) => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  }, []);

  const renderEntity = (entity: HeroSchema['entities'][number], index: number) => {
    switch (entity.type) {
      case 'HERO_TYPE_MAIN':
        return (
          <CommonEntity
            title='main add'
            prefix={`entities.${index}.main`}
            landscapeLink={mediaUrls.main.landscape}
            portraitLink={mediaUrls.main.portrait}
            aspectRatio={{
              Portrait: ['9:16'],
              Landscape: ['2:1'],
            }}
            onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
              handleSaveMedia(media, index, 'main', orientation)
            }
          />
        );

      case 'HERO_TYPE_SINGLE':
        return (
          <CommonEntity
            title='single add'
            prefix={`entities.${index}.single`}
            landscapeLink={mediaUrls.single[index]?.landscape || ''}
            portraitLink={mediaUrls.single[index]?.portrait || ''}
            aspectRatio={{
              Portrait: ['9:16'],
              Landscape: ['2:1'],
            }}
            onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
              handleSaveMedia(media, index, 'single', orientation)
            }
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
              landscapeLink={mediaUrls.double[index]?.left?.landscape || ''}
              portraitLink={mediaUrls.double[index]?.left?.portrait || ''}
              aspectRatio={['1:1']}
              isDoubleAd={true}
              onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
                handleSaveMedia(media, index, 'doubleLeft', orientation)
              }
            />
            <CommonEntity
              title='right add'
              prefix={`entities.${index}.double.right`}
              landscapeLink={mediaUrls.double[index]?.right?.landscape || ''}
              portraitLink={mediaUrls.double[index]?.right?.portrait || ''}
              aspectRatio={['1:1']}
              isDoubleAd
              onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
                handleSaveMedia(media, index, 'doubleRight', orientation)
              }
            />
          </div>
        );

      case 'HERO_TYPE_FEATURED_PRODUCTS':
        return (
          <FeaturedProductBase
            index={index}
            entity={entity}
            product={featuredProducts.products}
            currentEntityIndex={featuredProducts.currentIndex}
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
    <div className='space-y-24'>
      {entities.map((entity, index) => {
        const isDeleted = deletedIndices.has(index);
        if (isDeleted) {
          return (
            <div
              key={index}
              className='border border-text relative opacity-50 bg-gray-100 dark:bg-gray-800'
            >
              <div className='p-4 flex items-center justify-between'>
                <span className='text-sm italic'>Entity marked for deletion</span>
                <Button
                  variant='simple'
                  className='py-1 px-3 cursor-pointer'
                  onClick={() => handleRestoreEntity(index)}
                >
                  restore
                </Button>
              </div>
            </div>
          );
        }

        return (
          <div key={index} className='border border-2 border-text relative'>
            <div
              ref={(el: HTMLDivElement | null) => {
                entityRefs.current[index] = el;
              }}
            >
              {renderEntity(entity, index)}
            </div>
            <Button
              variant='delete'
              className='absolute top-2 right-2 py-1 px-3 cursor-pointer'
              onClick={() => handleRemoveEntity(index)}
            >
              x
            </Button>
          </div>
        );
      })}
    </div>
  );
};
