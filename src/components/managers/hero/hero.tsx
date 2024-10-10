import { Box, Button, Grid, TextField, Typography } from '@mui/material';
import { addHero, getHero } from 'api/hero';
import {
  common_HeroEntityInsert,
  common_HeroFullInsert,
  common_HeroType,
  common_MediaFull,
  common_Product,
} from 'api/proto-http/admin';
import { ProductPickerModal } from 'components/common/productPickerModal';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { Layout } from 'components/login/layout';
import { calculateAspectRatio } from 'features/utilitty/calculateAspectRatio';
import { Field, FieldArray, Form, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';
import { HeroProductTable } from './heroProductsTable';
import { mapHeroFunction } from './mapHeroFunction';
import { SelectHeroType } from './selectHeroType';
import { removeEntityIndex, unshiftNewEntity } from './utility/arrayHelpers';

export const Hero: FC = () => {
  const [hero, setHero] = useState<common_HeroFullInsert>(mapHeroFunction());
  const [main, setMain] = useState<string>('');
  const [single, setSingle] = useState<{ [key: number]: string }>({});
  const [doubleAdd, setDoubleAdd] = useState<{
    [key: number]: { left: string | undefined; right: string | undefined };
  }>({});
  const [product, setProduct] = useState<{ [key: number]: common_Product[] }>({});
  const [currentEntityIndex, setCurrentEntityIndex] = useState<number | null>(null);
  const [allowedRatios, setAllowedRatios] = useState<{ [key: number]: string[] }>({});

  const [dialogOpen, setDialogOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleOpenProductSelection = (index: number) => {
    setCurrentEntityIndex(index);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => setIsModalOpen(false);

  const fetchDictionary = async () => {
    const response = await getHero({});
    if (!response) return;

    const heroEntities = response.hero?.entities || [];

    const mainAdd =
      heroEntities.find((entity) => entity.mainAdd)?.mainAdd?.singleAdd?.media?.media?.thumbnail
        ?.mediaUrl || '';
    const singleEntities = heroEntities.reduce(
      (acc, entity, index) => ({
        ...acc,
        [index]: entity.singleAdd?.media?.media?.thumbnail?.mediaUrl || '',
      }),
      {},
    );

    const doubleAddEntities: {
      [key: number]: { left: string | undefined; right: string | undefined };
    } = heroEntities.reduce<{
      [key: number]: { left: string | undefined; right: string | undefined };
    }>(
      (acc, entity, index) => ({
        ...acc,
        [index]: entity.doubleAdd
          ? {
              left: entity.doubleAdd.left?.media?.media?.thumbnail?.mediaUrl || '',
              right: entity.doubleAdd.right?.media?.media?.thumbnail?.mediaUrl || '',
            }
          : acc[index],
      }),
      {},
    );

    const productsForEntities = heroEntities.reduce(
      (acc, entity, index) => ({
        ...acc,
        [index]: entity.featuredProducts?.products || [],
      }),
      {},
    );

    const calculatedAllowedRatios: { [key: number]: string[] } = heroEntities.reduce(
      (acc, entity, index) => {
        if (entity.doubleAdd) {
          const leftRatio = calculateAspectRatio(
            entity.doubleAdd.left?.media?.media?.thumbnail?.width,
            entity.doubleAdd.left?.media?.media?.thumbnail?.height,
          );
          const rightRatio = calculateAspectRatio(
            entity.doubleAdd.right?.media?.media?.thumbnail?.width,
            entity.doubleAdd.right?.media?.media?.thumbnail?.height,
          );

          const leftAllowedRatios =
            leftRatio === '1:1' ? ['1:1'] : leftRatio === '4:5' ? ['4:5'] : ['4:5', '1:1'];
          const rightAllowedRatios =
            rightRatio === '1:1' ? ['1:1'] : rightRatio === '4:5' ? ['4:5'] : ['4:5', '1:1'];
          const combinedRatios = [...new Set([...leftAllowedRatios, ...rightAllowedRatios])];

          return {
            ...acc,
            [index]: combinedRatios,
          };
        }
        return acc;
      },
      {},
    );

    setHero(mapHeroFunction(response.hero));
    setMain(mainAdd);
    setSingle(singleEntities);
    setDoubleAdd(doubleAddEntities);
    setProduct(productsForEntities);
    setAllowedRatios(calculatedAllowedRatios);
  };

  useEffect(() => {
    fetchDictionary();
  }, []);

  const saveHero = async (values: common_HeroFullInsert) => {
    await addHero({ hero: values });
  };

  const handleProductsReorder = (newProductsOrder: common_Product[], index: number) => {
    setProduct((prevState) => ({
      ...prevState,
      [index]: newProductsOrder,
    }));
  };

  const handleSaveNewSelection = (
    newSelectedProducts: common_Product[],
    index: number,
    setFieldValue: any,
  ) => {
    const productIds = newSelectedProducts.map((product) => product.id);
    setFieldValue(`entities.${index}.featuredProducts.productIds`, productIds);
    setProduct((prevState) => ({
      ...prevState,
      [index]: newSelectedProducts,
    }));

    handleCloseModal();
  };

  const saveMainMedia = (selectedMedia: common_MediaFull[], setFieldValue: any, index: number) => {
    const newMainMedia = selectedMedia[0];
    setFieldValue(`entities.${index}.mainAdd.singleAdd.mediaId`, newMainMedia.id);
    setMain(newMainMedia.media?.thumbnail?.mediaUrl || '');
  };

  const saveSingleMedia = (
    selectedMedia: common_MediaFull[],
    setFieldValue: any,
    index: number,
  ) => {
    const newSingleMedia = selectedMedia[0];
    setFieldValue(`entities.${index}.singleAdd.mediaId`, newSingleMedia.id);
    setSingle((prev) => ({
      ...prev,
      [index]: newSingleMedia.media?.thumbnail?.mediaUrl || '',
    }));
  };

  const saveDoubleMedia = (
    selectedMedia: common_MediaFull[],
    side: 'left' | 'right',
    setFieldValue: any,
    index: number,
  ) => {
    if (!selectedMedia.length) return;

    const newDoubleMediaUrl = selectedMedia[0].media?.thumbnail?.mediaUrl;
    const doubleAddMediaId = selectedMedia[0].id;
    const ratio = calculateAspectRatio(
      selectedMedia[0].media?.thumbnail?.width,
      selectedMedia[0].media?.thumbnail?.height,
    );

    let newAllowedRatios = ['4:5', '1:1'];
    if (ratio === '4:5') {
      newAllowedRatios = ['4:5'];
    } else if (ratio === '1:1') {
      newAllowedRatios = ['1:1'];
    }

    setDoubleAdd((prevDoubleAdd) => ({
      ...prevDoubleAdd,
      [index]: {
        ...prevDoubleAdd[index],
        [side]: newDoubleMediaUrl,
      },
    }));

    setAllowedRatios((prevRatios) => ({
      ...prevRatios,
      [index]: newAllowedRatios,
    }));

    setFieldValue(`entities.${index}.doubleAdd.${side}.mediaId`, doubleAddMediaId);
  };

  const handleRemoveEntity = (index: number, arrayHelpers: any) => {
    setSingle((prevSingle) => removeEntityIndex(prevSingle, index));
    setDoubleAdd((prevDoubleAdd) => removeEntityIndex(prevDoubleAdd, index));
    setProduct((prevProduct) => removeEntityIndex(prevProduct, index));

    arrayHelpers.remove(index);
  };

  const handleUnshiftEntity = (newEntity: common_HeroType, arrayHelpers: any, values: any) => {
    const isMainType = newEntity === 'HERO_TYPE_MAIN_ADD';
    const existingMainIndex = values.entities?.findIndex(
      (entity: common_HeroEntityInsert) => entity.type === 'HERO_TYPE_MAIN_ADD',
    );

    if (isMainType) {
      arrayHelpers.unshift(newEntity);
    } else {
      if (existingMainIndex !== -1 && existingMainIndex !== undefined) {
        arrayHelpers.insert(existingMainIndex + 1, newEntity);
      } else {
        arrayHelpers.unshift(newEntity);
      }
    }
    setSingle(unshiftNewEntity(single, ''));
    setDoubleAdd(unshiftNewEntity(doubleAdd, { left: '', right: '' }));
    setProduct(unshiftNewEntity(product, []));
    setAllowedRatios(unshiftNewEntity(allowedRatios, ['1:1', '4:5']));
  };

  return (
    <Layout>
      <Formik initialValues={hero} enableReinitialize onSubmit={saveHero}>
        {({ values, handleSubmit, setFieldValue }) => (
          <Form onSubmit={handleSubmit}>
            <FieldArray
              name='entities'
              render={(arrayHelpers) => (
                <Grid
                  container
                  justifyContent='center'
                  marginTop={2}
                  alignItems='center'
                  spacing={2}
                >
                  <Grid item xs={12}>
                    <Field
                      component={SelectHeroType}
                      arrayHelpers={arrayHelpers}
                      unshiftEntity={handleUnshiftEntity}
                    />
                  </Grid>
                  {values.entities &&
                    values.entities.map((entity, index) => {
                      return (
                        <Grid item xs={12}>
                          <Grid container spacing={2} marginBottom='130px' justifyContent='center'>
                            {entity.type === 'HERO_TYPE_MAIN_ADD' && (
                              <>
                                <Grid item xs={12} md={10}>
                                  <Typography variant='h4' textTransform='uppercase'>
                                    main
                                  </Typography>
                                </Grid>
                                <Grid item xs={12} md={10}>
                                  <SingleMediaViewAndSelect
                                    link={main}
                                    aspectRatio={['4:5', '5:4', '1:1', '16:9', '9:16']}
                                    saveSelectedMedia={(selectedMedia) =>
                                      saveMainMedia(selectedMedia, setFieldValue, index)
                                    }
                                  />
                                  <Box component='div' display='grid' gap='10px' marginTop='10px'>
                                    <Field
                                      as={TextField}
                                      name={`entities.${index}.mainAdd.singleAdd.exploreLink`}
                                      label='EXPLORE LINK'
                                      fullwidth
                                    />
                                    <Field
                                      as={TextField}
                                      name={`entities.${index}.mainAdd.singleAdd.exploreText`}
                                      label='EXPLORE TEXT'
                                      fullwidth
                                    />
                                  </Box>
                                </Grid>
                              </>
                            )}
                            {entity.type === 'HERO_TYPE_SINGLE_ADD' && (
                              <>
                                <Grid item xs={12} md={10}>
                                  <Typography variant='h4' textTransform='uppercase'>
                                    single add
                                  </Typography>
                                </Grid>
                                <Grid item xs={12} md={10}>
                                  <SingleMediaViewAndSelect
                                    link={single[index]}
                                    aspectRatio={['16:9']}
                                    saveSelectedMedia={(selectedMedia) =>
                                      saveSingleMedia(selectedMedia, setFieldValue, index)
                                    }
                                  />
                                  <Box component='div' display='grid' gap='10px' marginTop='10px'>
                                    <Field
                                      as={TextField}
                                      name={`entities.${index}.singleAdd.exploreLink`}
                                      label='EXPLORE LINK'
                                      fullwidth
                                    />
                                    <Field
                                      as={TextField}
                                      name={`entities.${index}.singleAdd.exploreText`}
                                      label='EXPLORE TEXT'
                                      fullwidth
                                    />
                                  </Box>
                                </Grid>
                              </>
                            )}
                            {entity.type === 'HERO_TYPE_DOUBLE_ADD' && (
                              <>
                                <Grid item xs={12} md={10}>
                                  <Typography variant='h4' textTransform='uppercase'>
                                    double add
                                  </Typography>
                                </Grid>
                                <Grid item xs={12} md={5}>
                                  <SingleMediaViewAndSelect
                                    link={doubleAdd[index]?.left || ''}
                                    aspectRatio={allowedRatios[index] || ['4:5', '1:1']}
                                    saveSelectedMedia={(selectedMedia) =>
                                      saveDoubleMedia(selectedMedia, 'left', setFieldValue, index)
                                    }
                                  />
                                  <Box component='div' display='grid' gap='10px' marginTop='10px'>
                                    <Field
                                      as={TextField}
                                      name={`entities.${index}.doubleAdd.left.exploreLink`}
                                      label='EXPLORE LINK'
                                      fullwidth
                                    />
                                    <Field
                                      as={TextField}
                                      name={`entities.${index}.doubleAdd.left.exploreText`}
                                      label='EXPLORE TEXT'
                                      fullwidth
                                    />
                                  </Box>
                                </Grid>
                                <Grid item xs={12} md={5}>
                                  <SingleMediaViewAndSelect
                                    link={doubleAdd[index]?.right || ''}
                                    aspectRatio={allowedRatios[index] || ['4:5', '1:1']}
                                    saveSelectedMedia={(selectedMedia) =>
                                      saveDoubleMedia(selectedMedia, 'right', setFieldValue, index)
                                    }
                                  />
                                  <Box component='div' display='grid' gap='10px' marginTop='10px'>
                                    <Field
                                      as={TextField}
                                      name={`entities.${index}.doubleAdd.right.exploreLink`}
                                      label='EXPLORE LINK'
                                      fullwidth
                                    />
                                    <Field
                                      as={TextField}
                                      name={`entities.${index}.doubleAdd.right.exploreText`}
                                      label='EXPLORE TEXT'
                                      fullwidth
                                    />
                                  </Box>
                                </Grid>
                              </>
                            )}
                            {entity.type === 'HERO_TYPE_FEATURED_PRODUCTS' && (
                              <>
                                <Grid item xs={12} md={10}>
                                  <Typography variant='h4' textTransform='uppercase'>
                                    featured products
                                  </Typography>
                                </Grid>
                                <Grid item xs={12} md={10}>
                                  <HeroProductTable
                                    products={product[index] || []}
                                    id={index}
                                    onReorder={(newProductsOrder) =>
                                      handleProductsReorder(newProductsOrder, index)
                                    }
                                    setFieldValue={setFieldValue}
                                  />
                                  <Button
                                    variant='contained'
                                    onClick={() => handleOpenProductSelection(index)}
                                    sx={{ textTransform: 'uppercase' }}
                                  >
                                    add products
                                  </Button>
                                </Grid>
                                <ProductPickerModal
                                  open={isModalOpen && currentEntityIndex === index}
                                  onClose={handleCloseModal}
                                  onSave={(selectedProduct) =>
                                    handleSaveNewSelection(selectedProduct, index, setFieldValue)
                                  }
                                  selectedProductIds={(product[index] || []).map((x) => x.id!)}
                                />
                              </>
                            )}
                            <Grid item xs={12} md={10}>
                              <Button
                                variant='contained'
                                color='error'
                                onClick={() => {
                                  handleRemoveEntity(index, arrayHelpers);
                                }}
                              >
                                Remove Entity
                              </Button>
                            </Grid>
                          </Grid>
                        </Grid>
                      );
                    })}
                </Grid>
              )}
            />

            <Grid container justifyContent='center' style={{ marginTop: '20px' }}>
              <Button
                type='submit'
                variant='contained'
                color='primary'
                disabled={values.entities?.length === 0}
              >
                Save
              </Button>
            </Grid>
          </Form>
        )}
      </Formik>
    </Layout>
  );
};
