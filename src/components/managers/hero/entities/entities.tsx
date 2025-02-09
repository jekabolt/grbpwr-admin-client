import { Box, Button, Divider, Grid2 as Grid, TextField } from '@mui/material';
import { common_HeroFullInsert, common_MediaFull, common_Product } from 'api/proto-http/admin';
import { common_ArchiveFull } from 'api/proto-http/frontend';
import { Field, useFormikContext } from 'formik';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/hero.scss';
import { removeEntityIndex } from '../utility/arrayHelpers';
import { getAllowedRatios } from '../utility/getAllowedRatios';
import { createMediaSaveConfigs } from '../utility/save-media-config';
import { CommonEntity } from './common-entity/common-entity';
import { FeaturedArchive } from './featured-archive/featured-archive';
import { FeaturedProductBase } from './featured-products-(tags)/featured-prduct-base';
import { EntitiesProps } from './interface/interface';

export const Entities: FC<EntitiesProps> = ({ entityRefs, entities, arrayHelpers }) => {
  const { values, setFieldValue } = useFormikContext<common_HeroFullInsert>();
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
    const mainLandscape =
      entities.find((e) => e.main)?.main?.single?.mediaLandscape?.media?.thumbnail?.mediaUrl || '';
    const mainPortraitUrl =
      entities.find((e) => e.main)?.main?.single?.mediaPortrait?.media?.thumbnail?.mediaUrl || '';

    const singleEntities: { [key: number]: string } = {};
    const singlePortraitEntities: { [key: number]: string } = {};
    const doubleAddEntities: { [key: number]: { left: string; right: string } } = {};
    const productsForEntities: { [key: number]: common_Product[] } = {};
    const productTagsForEntities: { [key: number]: common_Product[] } = {};
    const archiveForEntities: { [key: number]: common_ArchiveFull[] } = {};
    const calculatedAllowedRatios: { [key: number]: string[] } = {};

    entities.forEach((e, i) => {
      singleEntities[i] = e.single?.mediaLandscape?.media?.thumbnail?.mediaUrl || '';
      singlePortraitEntities[i] = e.single?.mediaPortrait?.media?.thumbnail?.mediaUrl || '';

      doubleAddEntities[i] = {
        left: e.double?.left?.mediaLandscape?.media?.thumbnail?.mediaUrl || '',
        right: e.double?.right?.mediaLandscape?.media?.thumbnail?.mediaUrl || '',
      };

      productsForEntities[i] = e.featuredProducts?.products || [];
      productTagsForEntities[i] = e.featuredProductsTag?.products?.products || [];
      archiveForEntities[i] = e.featuredArchive?.archive ? [e.featuredArchive.archive] : [];

      const allowedRatios = getAllowedRatios(e);
      if (allowedRatios.length > 0) {
        calculatedAllowedRatios[i] = allowedRatios;
      }
    });

    setMain(mainLandscape);
    setMainPortrait(mainPortraitUrl);
    setSingle(singleEntities);
    setSinglePortrait(singlePortraitEntities);
    setDoubleAdd(doubleAddEntities);
    setProduct(productsForEntities);
    setProductTags(productTagsForEntities);
    setArchive(archiveForEntities);
  };

  useEffect(() => {
    fetchEntities();
  }, [entities]);

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
    const productIds = newSelectedProducts.map((product) => product.id);
    setFieldValue(`entities.${index}.featuredProducts.productIds`, productIds);
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
      setFieldValue(
        `entities.${index}.double.${type === 'doubleLeft' ? 'left' : 'right'}.mediaLandscapeId`,
        media.id,
      );
      setFieldValue(
        `entities.${index}.double.${type === 'doubleLeft' ? 'left' : 'right'}.mediaPortraitId`,
        media.id,
      );
    } else {
      setFieldValue(config.fieldPath, media.id);
    }

    // Update both portrait and landscape states based on orientation
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
    setFieldValue(`entities.${index}.featuredArchive.archiveId`, newSelectedArchive[0].id);
    setArchive((prevState) => ({
      ...prevState,
      [index]: newSelectedArchive,
    }));
    handleCloseModal();
  };

  return (
    <Grid container spacing={2} marginTop={5}>
      {values.entities &&
        values.entities.map((entity, index) => (
          <Grid size={{ xs: 12 }} ref={(el) => (entityRefs.current[index] = el)}>
            <Grid container spacing={2} className={styles.entity_container}>
              {entity.type === 'HERO_TYPE_MAIN' && (
                <Grid size={{ xs: 7 }}>
                  <CommonEntity
                    title='main add'
                    prefix={`entities.${index}.main.single`}
                    landscapeLink={main}
                    portraitLink={mainPortrait}
                    exploreLink={entity.main?.single?.exploreLink}
                    size={{ xs: 12 }}
                    aspectRatio={{
                      Portrait: ['9:16'],
                      Landscape: ['2:1'],
                    }}
                    onSaveMedia={(
                      media: common_MediaFull[],
                      orientation: 'Portrait' | 'Landscape',
                    ) => saveMedia(media, 'main', index, orientation)}
                  />
                  <Box component='div' className={styles.fields}>
                    <Field
                      as={TextField}
                      name={`entities.${index}.main.tag`}
                      label='tag'
                      fullWidth
                    />
                    <Field
                      as={TextField}
                      name={`entities.${index}.main.description`}
                      label='description'
                      fullWidth
                    />
                  </Box>
                </Grid>
              )}
              {entity.type === 'HERO_TYPE_SINGLE' && (
                <Grid size={{ xs: 7 }}>
                  <CommonEntity
                    title='single add'
                    prefix={`entities.${index}.single`}
                    landscapeLink={single[index]}
                    portraitLink={singlePortrait[index]}
                    exploreLink={entity.single?.exploreLink}
                    size={{ xs: 12 }}
                    aspectRatio={{
                      Portrait: ['9:16'],
                      Landscape: ['2:1'],
                    }}
                    onSaveMedia={(
                      media: common_MediaFull[],
                      orientation: 'Portrait' | 'Landscape',
                    ) => saveMedia(media, 'single', index, orientation)}
                  />
                </Grid>
              )}
              {entity.type === 'HERO_TYPE_DOUBLE' && (
                <Grid size={{ xs: 7 }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <CommonEntity
                        title='double add'
                        prefix={`entities.${index}.double.left`}
                        landscapeLink={doubleAdd[index]?.left || ''}
                        portraitLink={doubleAdd[index]?.left || ''}
                        exploreLink={entity.double?.left?.exploreLink}
                        size={{ xs: 12 }}
                        aspectRatio={['1:1']}
                        isDoubleAd={true}
                        onSaveMedia={(
                          media: common_MediaFull[],
                          orientation: 'Portrait' | 'Landscape',
                        ) => saveMedia(media, 'doubleLeft', index, orientation)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }} sx={{ marginTop: '42px' }}>
                      <CommonEntity
                        title=''
                        prefix={`entities.${index}.double.right`}
                        landscapeLink={doubleAdd[index]?.right || ''}
                        portraitLink={doubleAdd[index]?.right || ''}
                        exploreLink={entity.double?.right?.exploreLink}
                        size={{ xs: 12 }}
                        aspectRatio={['1:1']}
                        isDoubleAd
                        onSaveMedia={(media: common_MediaFull[]) =>
                          saveMedia(media, 'doubleRight', index, 'Landscape')
                        }
                      />
                    </Grid>
                  </Grid>
                </Grid>
              )}
              {entity.type === 'HERO_TYPE_FEATURED_PRODUCTS' && (
                <Grid size={{ xs: 7 }}>
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
                </Grid>
              )}
              {entity.type === 'HERO_TYPE_FEATURED_PRODUCTS_TAG' && (
                <Grid size={{ xs: 7 }}>
                  <FeaturedProductBase
                    index={index}
                    entity={entity}
                    product={productTags}
                    title='featured products tag'
                    prefix='featuredProductsTag'
                    handleProductsReorder={(e, i) => handleProductsReorder(e, i, true)}
                  />
                </Grid>
              )}
              {entity.type === 'HERO_TYPE_FEATURED_ARCHIVE' && (
                <Grid size={{ xs: 7 }}>
                  <Field
                    component={FeaturedArchive}
                    archive={archive}
                    index={index}
                    currentEntityIndex={currentEntityIndex}
                    handleOpenArchiveSelection={handleOpenArchiveSelection}
                    handleSaveArchiveSelection={handleSaveArchive}
                    open={isModalOpen}
                    onClose={handleCloseModal}
                  />
                </Grid>
              )}
              <Grid size={{ xs: 7 }}>
                <Button
                  variant='contained'
                  color='error'
                  onClick={() => {
                    handleRemoveEntity(index, arrayHelpers, values);
                  }}
                >
                  Remove Entity
                </Button>
              </Grid>
              <Grid size={{ xs: 12 }} className={styles.divider_container}>
                <Divider className={styles.divider} />
              </Grid>
            </Grid>
          </Grid>
        ))}
    </Grid>
  );
};
