import { common_MediaFull, common_Product } from 'api/proto-http/admin';
import { common_ArchiveFull } from 'api/proto-http/frontend';
import { FC, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { FeaturedProductBase } from '../entities/featured-products-(tags)/featured-prduct-base';
import { EntitiesProps } from '../entities/interface/interface';
import { removeEntityIndex } from '../utility/arrayHelpers';
import { createMediaSaveConfigs } from '../utility/save-media-config';
import { CommonEntity } from './common-entity';
import { HeroSchema } from './schema';

export const Entities: FC<EntitiesProps> = ({ entityRefs, arrayHelpers }) => {
  const { watch, setValue } = useFormContext<HeroSchema>();
  const values = watch();
  const [main, setMain] = useState<string>('');
  const [mainPortrait, setMainPortrait] = useState<string>('');
  const [single, setSingle] = useState<{ [key: number]: string }>({});
  const [singlePortrait, setSinglePortrait] = useState<{ [key: number]: string }>({});
  const [doubleAdd, setDoubleAdd] = useState<{
    [key: number]: { left: string | undefined; right: string | undefined };
  }>({});
  const [product, setProduct] = useState<{ [key: number]: common_Product[] }>({});
  const [productTags, setProductTags] = useState<{ [key: number]: common_Product[] }>({});
  const [archive, setArchive] = useState<{ [key: number]: common_ArchiveFull[] }>({});
  const [currentEntityIndex, setCurrentEntityIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const mediaSaveConfigs = createMediaSaveConfigs(setMain, setSingle, setDoubleAdd);

  const handleOpenProductSelection = (index: number) => {
    setCurrentEntityIndex(index);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => setIsModalOpen(false);

  const fetchEntities = () => {
    // We store thumbnail URLs for preview; initialize empty when only IDs are available
    // Note: Media URLs are only available after media selection, not from form data
    setMain('');
    setMainPortrait('');

    const entityMappings = (values.entities || []).reduce(
      (acc, entity, index) => {
        return {
          single: {
            ...acc.single,
            [index]: entity.type === 'HERO_TYPE_SINGLE' ? entity.single?.mediaLandscapeId || 0 : 0,
          },
          singlePortrait: {
            ...acc.singlePortrait,
            [index]: entity.type === 'HERO_TYPE_SINGLE' ? entity.single?.mediaPortraitId || 0 : 0,
          },
          doubleAdd: {
            ...acc.doubleAdd,
            [index]: {
              left:
                entity.type === 'HERO_TYPE_DOUBLE' ? entity.double?.left?.mediaLandscapeId || 0 : 0,
              right:
                entity.type === 'HERO_TYPE_DOUBLE'
                  ? entity.double?.right?.mediaLandscapeId || 0
                  : 0,
            },
          },
          products: {
            ...acc.products,
            [index]:
              entity.type === 'HERO_TYPE_FEATURED_PRODUCTS'
                ? entity.featuredProducts?.productIds || []
                : [],
          },
          productTags: {
            ...acc.productTags,
            [index]: entity.type === 'HERO_TYPE_FEATURED_PRODUCTS_TAG' ? entity.tag || '' : '',
          },
          archive: {
            ...acc.archive,
            [index]: 0,
          },
        };
      },
      {
        single: {},
        singlePortrait: {},
        doubleAdd: {},
        products: {},
        productTags: {},
        archive: {},
      },
    );

    setSingle(entityMappings.single);
    setSinglePortrait(entityMappings.singlePortrait);
    setDoubleAdd(entityMappings.doubleAdd);
    setProduct(entityMappings.products);
    setProductTags(entityMappings.productTags);
    setArchive(entityMappings.archive);
  };

  useEffect(() => {
    fetchEntities();
  }, [values.entities]);

  const handleProductsReorder = (
    newProductsOrder: common_Product[],
    index: number,
    isProductTag: boolean = false,
  ) => {
    if (isProductTag) {
      setProductTags((prevState) => ({
        ...prevState,
        [index]: newProductsOrder,
      }));
    } else {
      setProduct((prevState) => ({
        ...prevState,
        [index]: newProductsOrder,
      }));
    }
  };

  const handleSaveNewSelection = (newSelectedProducts: common_Product[], index: number) => {
    const productIds = newSelectedProducts
      .map((product) => product.id)
      .filter((id): id is number => id !== undefined);
    setValue(`entities.${index}.featuredProducts.productIds` as any, productIds);
    setProduct((prevState) => ({
      ...prevState,
      [index]: newSelectedProducts,
    }));

    handleCloseModal();
  };

  const saveMedia = (
    selectedMedia: common_MediaFull[],
    type: 'main' | 'single' | 'doubleLeft' | 'doubleRight',
    index: number,
    orientation: 'Portrait' | 'Landscape',
  ) => {
    if (!selectedMedia.length) return;

    const media = selectedMedia[0];
    const config = mediaSaveConfigs[type](index, orientation);
    const thumbnailURL = media.media?.thumbnail?.mediaUrl || '';

    if (type === 'doubleLeft' || type === 'doubleRight') {
      setValue(
        `entities.${index}.double.${type === 'doubleLeft' ? 'left' : 'right'}.mediaLandscapeId` as any,
        media.id,
      );
      setValue(
        `entities.${index}.double.${type === 'doubleLeft' ? 'left' : 'right'}.mediaPortraitId` as any,
        media.id,
      );
    } else {
      setValue(config.fieldPath as any, media.id);
    }

    if (type === 'main') {
      if (orientation === 'Portrait') {
        setMainPortrait(thumbnailURL);
      } else {
        setMain(thumbnailURL);
      }
    } else if (type === 'single') {
      if (orientation === 'Portrait') {
        setSinglePortrait((prev) => ({ ...prev, [index]: thumbnailURL }));
      } else {
        setSingle((prev) => ({ ...prev, [index]: thumbnailURL }));
      }
    } else {
      config.state(thumbnailURL);
    }
  };

  const handleRemoveEntity = (index: number, arrayHelpers: any, values: any) => {
    if (values.entities[index].type === 'HERO_TYPE_MAIN_ADD') {
      setMain('');
    }
    setSingle((prevSingle) => removeEntityIndex(prevSingle, index));
    setDoubleAdd((prevDoubleAdd) => removeEntityIndex(prevDoubleAdd, index));
    setProduct((prevProduct) => removeEntityIndex(prevProduct, index));
    setProductTags((prevProductTags) => removeEntityIndex(prevProductTags, index));
    setArchive((prevArchive) => removeEntityIndex(prevArchive, index));

    arrayHelpers.remove(index);
  };

  const handleOpenArchiveSelection = (index: number) => {
    setCurrentEntityIndex(index);
    setIsModalOpen(true);
  };

  const handleSaveArchive = (newSelectedArchive: common_ArchiveFull[], index: number) => {
    setValue(
      `entities.${index}.featuredArchive.archiveId` as any,
      newSelectedArchive[0].archiveList?.id,
    );
    setArchive((prevState) => ({
      ...prevState,
      [index]: newSelectedArchive,
    }));
    handleCloseModal();
  };

  return (
    <div className='mt-8 space-y-6'>
      {values.entities &&
        values.entities.map((entity, index) => (
          <div key={index} className='border rounded-lg p-4'>
            <div
              ref={(el: HTMLDivElement | null) => {
                entityRefs.current[index] = el;
              }}
            >
              <div className='space-y-4'>
                {entity.type === 'HERO_TYPE_MAIN' && (
                  <div className='w-full'>
                    <CommonEntity
                      title='main add'
                      prefix={`entities.${index}.main`}
                      landscapeLink={main}
                      portraitLink={mainPortrait}
                      aspectRatio={{
                        Portrait: ['9:16'],
                        Landscape: ['2:1'],
                      }}
                      onSaveMedia={(
                        media: common_MediaFull[],
                        orientation: 'Portrait' | 'Landscape',
                      ) => saveMedia(media, 'main', index, orientation)}
                    />
                  </div>
                )}
                {entity.type === 'HERO_TYPE_SINGLE' && (
                  <div className='w-full'>
                    <CommonEntity
                      title='single add'
                      prefix={`entities.${index}.single`}
                      landscapeLink={single[index]}
                      portraitLink={singlePortrait[index]}
                      aspectRatio={{
                        Portrait: ['9:16'],
                        Landscape: ['2:1'],
                      }}
                      onSaveMedia={(
                        media: common_MediaFull[],
                        orientation: 'Portrait' | 'Landscape',
                      ) => saveMedia(media, 'single', index, orientation)}
                    />
                  </div>
                )}
                {entity.type === 'HERO_TYPE_DOUBLE' && (
                  <div className='w-full'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <div>
                        <CommonEntity
                          title='double add'
                          prefix={`entities.${index}.double.left`}
                          landscapeLink={doubleAdd[index]?.left || ''}
                          portraitLink={doubleAdd[index]?.left || ''}
                          aspectRatio={['1:1']}
                          isDoubleAd={true}
                          onSaveMedia={(
                            media: common_MediaFull[],
                            orientation: 'Portrait' | 'Landscape',
                          ) => saveMedia(media, 'doubleLeft', index, orientation)}
                        />
                      </div>
                      <div className='mt-10'>
                        <CommonEntity
                          title=''
                          prefix={`entities.${index}.double.right`}
                          landscapeLink={doubleAdd[index]?.right || ''}
                          portraitLink={doubleAdd[index]?.right || ''}
                          aspectRatio={['1:1']}
                          isDoubleAd
                          onSaveMedia={(media: common_MediaFull[]) =>
                            saveMedia(media, 'doubleRight', index, 'Landscape')
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
                {entity.type === 'HERO_TYPE_FEATURED_PRODUCTS' && (
                  <div className='w-full'>
                    <FeaturedProductBase
                      index={index}
                      entity={entity}
                      product={product}
                      currentEntityIndex={currentEntityIndex}
                      isModalOpen={isModalOpen}
                      showProductPicker={true}
                      title='featured products'
                      prefix='featuredProducts'
                      handleOpenProductSelection={handleOpenProductSelection}
                      handleCloseModal={handleCloseModal}
                      handleSaveNewSelection={handleSaveNewSelection}
                      handleProductsReorder={handleProductsReorder}
                    />
                  </div>
                )}
                {entity.type === 'HERO_TYPE_FEATURED_PRODUCTS_TAG' && (
                  <div className='w-full'>
                    <FeaturedProductBase
                      index={index}
                      entity={entity}
                      product={productTags}
                      title='featured products tag'
                      prefix='featuredProductsTag'
                      handleProductsReorder={(e, i) => handleProductsReorder(e, i, true)}
                    />
                  </div>
                )}

                <Button
                  className='border border-red-500'
                  onClick={() => {
                    handleRemoveEntity(index, arrayHelpers, values);
                  }}
                >
                  Remove Entity
                </Button>

                <div className='w-full border-t pt-4' />
              </div>
            </div>
          </div>
        ))}
    </div>
  );
};
