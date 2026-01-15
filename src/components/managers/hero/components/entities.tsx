import { common_MediaFull } from 'api/proto-http/admin';
import { FC, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { EntitiesProps } from '../entities/interface/interface';
import { CommonEntity } from './common-entity';
import { FeaturedProductBase } from './featured-prduct-base';
import { HeroSchema } from './schema';
import { useEntityMedia } from './useEntityMedia';
import { useProductSelection } from './useProductSelection';

export const Entities: FC<EntitiesProps> = ({ entityRefs, arrayHelpers, initialProducts }) => {
  const { watch, setValue } = useFormContext<HeroSchema>();
  const entities = watch('entities') || [];

  const mediaUrls = useEntityMedia(entities);
  const featuredProducts = useProductSelection(initialProducts);
  const featuredProductsTags = useProductSelection();

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

      setValue(idPath as any, media.id);
      setValue(urlPath as any, thumbnailUrl);
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

  const handleRemoveEntity = useCallback(
    (index: number) => {
      arrayHelpers.remove(index);
    },
    [arrayHelpers],
  );

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
          <div className='flex flex-col lg:flex-row items-start gap-4'>
            <div className='w-full'>
              <CommonEntity
                title='double add'
                prefix={`entities.${index}.double.left`}
                landscapeLink={mediaUrls.double[index]?.left || ''}
                portraitLink={mediaUrls.double[index]?.left || ''}
                aspectRatio={['1:1']}
                isDoubleAd={true}
                onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
                  handleSaveMedia(media, index, 'doubleLeft', orientation)
                }
              />
            </div>
            <div className='w-full'>
              <CommonEntity
                title=''
                prefix={`entities.${index}.double.right`}
                landscapeLink={mediaUrls.double[index]?.right || ''}
                portraitLink={mediaUrls.double[index]?.right || ''}
                aspectRatio={['1:1']}
                isDoubleAd
                onSaveMedia={(media: common_MediaFull[]) =>
                  handleSaveMedia(media, index, 'doubleRight', 'Landscape')
                }
              />
            </div>
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
            product={featuredProductsTags.products}
            title='featured products tag'
            prefix='featuredProductsTag'
            handleProductsReorder={(e, i) => featuredProductsTags.reorderProducts(e, i)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className='mt-16 space-y-24'>
      {entities.map((entity, index) => (
        <div key={index} className='border border-text relative'>
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
      ))}
    </div>
  );
};
