import { Alert, Box, Button, Divider, Grid, Snackbar, TextField, Typography } from '@mui/material';
import { addHero, getHero } from 'api/hero';
import { common_HeroFullInsert, common_MediaFull, common_Product } from 'api/proto-http/admin';
import { ProductPickerModal } from 'components/common/productPickerModal';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { Layout } from 'components/login/layout';
import { calculateAspectRatio } from 'features/utilitty/calculateAspectRatio';
import { isValidUrlForHero } from 'features/utilitty/isValidUrl';
import { ErrorMessage, Field, FieldArray, Form, Formik } from 'formik';
import { FC, useEffect, useRef, useState } from 'react';
import styles from 'styles/hero.scss';
import { HeroProductTable } from './heroProductsTable';
import { SelectHeroType } from './selectHeroType';
import { removeEntityIndex } from './utility/arrayHelpers';
import { getAllowedRatios } from './utility/getAllowedRatios';
import { heroValidationSchema } from './utility/heroValidationShema';
import { mapHeroFunction } from './utility/mapHeroFunction';

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');
  const entityRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(true);
  };

  const handleOpenProductSelection = (index: number) => {
    setCurrentEntityIndex(index);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => setIsModalOpen(false);

  const fetchHero = async () => {
    const response = await getHero({});
    if (!response) return;

    const heroEntities = response.hero?.entities || [];

    const mainAdd =
      heroEntities.find((e) => e.mainAdd)?.mainAdd?.singleAdd?.media?.media?.thumbnail?.mediaUrl ||
      '';
    const singleEntities = heroEntities.reduce(
      (acc, e, i) => ({ ...acc, [i]: e.singleAdd?.media?.media?.thumbnail?.mediaUrl || '' }),
      {},
    );
    const doubleAddEntities = heroEntities.reduce<{
      [key: number]: { left: string; right: string };
    }>(
      (acc, e, i) => ({
        ...acc,
        [i]: e.doubleAdd
          ? {
              left: e.doubleAdd.left?.media?.media?.thumbnail?.mediaUrl || '',
              right: e.doubleAdd.right?.media?.media?.thumbnail?.mediaUrl || '',
            }
          : { left: '', right: '' },
      }),
      {},
    );
    const productsForEntities = heroEntities.reduce(
      (acc, e, i) => ({ ...acc, [i]: e.featuredProducts?.products || [] }),
      {},
    );

    const calculatedAllowedRatios = heroEntities.reduce<{ [key: number]: string[] }>(
      (acc, e, i) => {
        const allowedRatios = getAllowedRatios(e);
        if (allowedRatios.length > 0) {
          acc[i] = allowedRatios;
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
    fetchHero();
    console.log(allowedRatios);
  }, []);

  const saveHero = async (values: common_HeroFullInsert) => {
    try {
      await addHero({ hero: values });
      showMessage('HERO SAVED SUCCESSFULLY', 'success');
    } catch {
      showMessage("HERO CAN'T BE SAVED", 'error');
    }
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

  const handleRemoveEntity = (index: number, arrayHelpers: any, values: any) => {
    if (values.entities[index].type === 'HERO_TYPE_MAIN_ADD') {
      setMain('');
    }
    setSingle((prevSingle) => removeEntityIndex(prevSingle, index));
    setDoubleAdd((prevDoubleAdd) => removeEntityIndex(prevDoubleAdd, index));
    setProduct((prevProduct) => removeEntityIndex(prevProduct, index));

    arrayHelpers.remove(index);
  };

  return (
    <Layout>
      <Formik
        initialValues={hero}
        validationSchema={heroValidationSchema}
        enableReinitialize
        onSubmit={saveHero}
      >
        {({ values, handleSubmit, setFieldValue, errors, touched }) => (
          <Form onSubmit={handleSubmit}>
            <FieldArray
              name='entities'
              render={(arrayHelpers) => (
                <Grid container spacing={2} className={styles.entities_container}>
                  {values.entities &&
                    values.entities.map((entity, index) => (
                      <Grid item xs={12} ref={(el) => (entityRefs.current[index] = el)}>
                        <Grid container spacing={2} className={styles.entity_container}>
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
                                {`${errors}.entities.${index}.mainAdd..singleAdd.mediaId` && (
                                  <ErrorMessage
                                    className={styles.error}
                                    name={`entities.${index}.mainAdd.singleAdd.mediaId`}
                                    component='div'
                                  />
                                )}
                                <Box component='div' className={styles.fields}>
                                  <Field
                                    as={TextField}
                                    name={`entities.${index}.mainAdd.singleAdd.exploreLink`}
                                    label='EXPLORE LINK'
                                    error={
                                      (entity.mainAdd?.singleAdd?.exploreLink && errors.entities) ||
                                      (entity.mainAdd?.singleAdd?.exploreLink &&
                                        !isValidUrlForHero(entity.mainAdd?.singleAdd?.exploreLink))
                                    }
                                    helperText={
                                      entity.mainAdd?.singleAdd?.exploreLink && errors.entities
                                        ? 'This field is required'
                                        : entity.mainAdd?.singleAdd?.exploreLink &&
                                            !isValidUrlForHero(
                                              entity.mainAdd?.singleAdd?.exploreLink,
                                            )
                                          ? 'Please enter a valid URL'
                                          : ''
                                    }
                                    fullWidth
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
                                {`${errors}.entities.${index}.singleAdd.mediaId` && (
                                  <ErrorMessage
                                    className={styles.error}
                                    name={`entities.${index}.singleAdd.mediaId`}
                                    component='div'
                                  />
                                )}
                                <Box component='div' className={styles.fields}>
                                  <Field
                                    as={TextField}
                                    name={`entities.${index}.singleAdd.exploreLink`}
                                    label='EXPLORE LINK'
                                    error={
                                      entity.singleAdd?.exploreLink
                                        ? !isValidUrlForHero(entity.singleAdd?.exploreLink)
                                        : false
                                    }
                                    helperText={
                                      entity.singleAdd?.exploreLink &&
                                      !isValidUrlForHero(entity.singleAdd?.exploreLink)
                                        ? 'THIS IS NOT VALID EXPLORE LINK'
                                        : ''
                                    }
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
                                {`${errors}.entities.${index}.doubleAdd.left.mediaId` && (
                                  <ErrorMessage
                                    className={styles.error}
                                    name={`entities.${index}.doubleAdd.left.mediaId`}
                                    component='div'
                                  />
                                )}
                                <Box component='div' className={styles.fields}>
                                  <Field
                                    as={TextField}
                                    name={`entities.${index}.doubleAdd.left.exploreLink`}
                                    label='EXPLORE LINK'
                                    error={
                                      entity.doubleAdd?.left?.exploreLink
                                        ? !isValidUrlForHero(entity.doubleAdd?.left?.exploreLink)
                                        : false
                                    }
                                    helperText={
                                      entity.doubleAdd?.left?.exploreLink &&
                                      !isValidUrlForHero(entity.doubleAdd?.left?.exploreLink)
                                        ? 'THIS IS NOT VALID EXPLORE LINK'
                                        : ''
                                    }
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
                                {`${errors}.entities.${index}.doubleAdd.right.mediaId` && (
                                  <ErrorMessage
                                    className={styles.error}
                                    name={`entities.${index}.doubleAdd.right.mediaId`}
                                    component='div'
                                  />
                                )}
                                <Box component='div' className={styles.fields}>
                                  <Field
                                    as={TextField}
                                    name={`entities.${index}.doubleAdd.right.exploreLink`}
                                    label='EXPLORE LINK'
                                    error={
                                      entity.doubleAdd?.right?.exploreLink
                                        ? !isValidUrlForHero(entity.doubleAdd?.right?.exploreLink)
                                        : false
                                    }
                                    helperText={
                                      entity.doubleAdd?.right?.exploreLink &&
                                      !isValidUrlForHero(entity.doubleAdd?.right?.exploreLink)
                                        ? 'THIS IS NOT VALID EXPLORE LINK'
                                        : ''
                                    }
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
                                <Box component='div' className={styles.fields}>
                                  <Field
                                    as={TextField}
                                    name={`entities.${index}.featuredProducts.title`}
                                    label='TITLE'
                                    fullWidth
                                  />
                                  <Field
                                    as={TextField}
                                    name={`entities.${index}.featuredProducts.exploreLink`}
                                    label='EXPLORE LINK'
                                    error={
                                      entity.featuredProducts?.exploreLink
                                        ? !isValidUrlForHero(entity.featuredProducts.exploreLink)
                                        : false
                                    }
                                    helperText={
                                      entity.featuredProducts?.exploreLink &&
                                      !isValidUrlForHero(entity.featuredProducts.exploreLink)
                                        ? 'THIS IS NOT A VALID EXPLORE LINK'
                                        : ''
                                    }
                                    fullWidth
                                  />
                                  <Field
                                    as={TextField}
                                    name={`entities.${index}.featuredProducts.exploreText`}
                                    label='EXPLORE TEXT'
                                    fullWidth
                                  />
                                </Box>
                                <HeroProductTable
                                  products={product[index] || []}
                                  id={index}
                                  onReorder={(newProductsOrder) =>
                                    handleProductsReorder(newProductsOrder, index)
                                  }
                                  setFieldValue={setFieldValue}
                                />
                                {`${errors}.entities.${index}.featuredProducts.productIds` && (
                                  <ErrorMessage
                                    className={styles.error}
                                    name={`entities.${index}.featuredProducts.productIds`}
                                    component='div'
                                  />
                                )}
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
                                handleRemoveEntity(index, arrayHelpers, values);
                              }}
                            >
                              Remove Entity
                            </Button>
                          </Grid>
                          <Grid item xs={12} md={10} className={styles.divider_container}>
                            <Divider className={styles.divider} />
                          </Grid>
                        </Grid>
                      </Grid>
                    ))}
                  <Grid item xs={12} md={10}>
                    <Field
                      component={SelectHeroType}
                      arrayHelpers={arrayHelpers}
                      entityRefs={entityRefs}
                    />
                  </Grid>
                </Grid>
              )}
            />

            <Grid container>
              <Button
                type='submit'
                variant='contained'
                color='primary'
                sx={{ position: 'fixed', bottom: '20px', right: '20px' }}
              >
                Save
              </Button>
            </Grid>
          </Form>
        )}
      </Formik>
      <Snackbar
        open={isSnackBarOpen}
        autoHideDuration={3000}
        onClose={() => setIsSnackBarOpen(false)}
      >
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Layout>
  );
};
