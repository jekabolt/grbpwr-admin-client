import { Button, Grid, Typography } from '@mui/material';
import { addHero, getHero } from 'api/hero';
import { common_HeroFullInsert, common_MediaFull, common_Product } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { Layout } from 'components/login/layout';
import { Field, FieldArray, Form, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';
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

  const [dialogOpen, setDialogOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleOpenProductSelection = (index: number) => {
    setCurrentEntityIndex(index);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => setIsModalOpen(false);

  const fetchDictionary = async () => {
    const response = await getHero({});
    if (response) {
      const heroEntities = response.hero?.entities || [];
      const mainAdd = heroEntities.find((entity) => entity.mainAdd);
      const singleEntities = heroEntities.map((entity, index) => ({
        [index]: entity.singleAdd?.media?.media?.thumbnail?.mediaUrl || '',
      }));
      const doubleAddEntities = heroEntities.reduce(
        (acc, entity, index) => {
          if (entity.doubleAdd) {
            acc[index] = {
              left: entity.doubleAdd?.left?.media?.media?.thumbnail?.mediaUrl || '',
              right: entity.doubleAdd?.right?.media?.media?.thumbnail?.mediaUrl || '',
            };
          }
          return acc;
        },
        {} as { [key: number]: { left: string | undefined; right: string | undefined } },
      );
      const productsForEntities = heroEntities.reduce(
        (acc, entity, index) => {
          if (entity.featuredProducts?.products) {
            acc[index] = entity.featuredProducts.products;
          }
          return acc;
        },
        {} as { [key: number]: common_Product[] },
      );

      setHero(mapHeroFunction(response.hero));
      setMain(mainAdd?.mainAdd?.singleAdd?.media?.media?.thumbnail?.mediaUrl || '');
      setSingle(Object.assign({}, ...singleEntities));
      setDoubleAdd(doubleAddEntities);
      setProduct(productsForEntities);
    }
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
    const doubleAddMediaId = selectedMedia[0];

    setDoubleAdd((prevDoubleAdd) => ({
      ...prevDoubleAdd,
      [index]: {
        ...prevDoubleAdd[index],
        [side]: newDoubleMediaUrl,
      },
    }));
    setFieldValue(`entities.${index}.doubleAdd.${side}.mediaId`, doubleAddMediaId.id);
  };

  const clearMediaState = (entityType: string) => {
    if (entityType === 'HERO_TYPE_MAIN_ADD') {
      setMain('');
    }
    if (entityType === 'HERO_TYPE_SINGLE_ADD') {
      setSingle('');
    }
  };

  const handleRemoveEntity = (index: number, arrayHelpers: any) => {
    setSingle((prevSingle) => removeEntityIndex(prevSingle, index));
    setDoubleAdd((prevDoubleAdd) => removeEntityIndex(prevDoubleAdd, index));
    setProduct((prevProduct) => removeEntityIndex(prevProduct, index));

    arrayHelpers.remove(index);
  };

  const handleUnshiftEntity = (newEntity: common_HeroFullInsert, arrayHelpers: any) => {
    arrayHelpers.unshift(newEntity);

    setSingle(unshiftNewEntity(single, ''));
    setDoubleAdd(unshiftNewEntity(doubleAdd, { left: '', right: '' }));
    setProduct(unshiftNewEntity(product, []));
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
                      const handleSaveNewSelection = (newSelectedProducts: common_Product[]) => {
                        const productIds = newSelectedProducts.map((product) => product.id);
                        setFieldValue(`entities.${index}.featuredProducts.productIds`, productIds);
                        setProduct((prevState) => ({
                          ...prevState,
                          [index]: newSelectedProducts,
                        }));

                        handleCloseModal();
                      };

                      return (
                        <Grid item xs={12}>
                          <Grid container spacing={2} justifyContent='center'>
                            {entity.type === 'HERO_TYPE_MAIN_ADD' && (
                              <Grid item xs={10} md={8}>
                                <Typography variant='subtitle1' textTransform='uppercase'>
                                  main
                                </Typography>
                                <SingleMediaViewAndSelect
                                  link={main}
                                  aspectRatio={['4:5', '5:4', '1:1', '16:9', '9:16']}
                                  saveSelectedMedia={(selectedMedia) =>
                                    saveMainMedia(selectedMedia, setFieldValue, index)
                                  }
                                />
                              </Grid>
                            )}
                            {entity.type === 'HERO_TYPE_SINGLE_ADD' && (
                              <Grid item xs={10}>
                                <SingleMediaViewAndSelect
                                  link={single[index]}
                                  aspectRatio={['16:9']}
                                  saveSelectedMedia={(selectedMedia) =>
                                    saveSingleMedia(selectedMedia, setFieldValue, index)
                                  }
                                />
                              </Grid>
                            )}
                            {entity.type === 'HERO_TYPE_DOUBLE_ADD' && (
                              <>
                                <Grid item xs={6}>
                                  <SingleMediaViewAndSelect
                                    link={doubleAdd[index]?.left || ''}
                                    aspectRatio={['4:5', '1:1']}
                                    saveSelectedMedia={(selectedMedia) =>
                                      saveDoubleMedia(selectedMedia, 'left', setFieldValue, index)
                                    }
                                  />
                                </Grid>
                                <Grid item xs={6}>
                                  <SingleMediaViewAndSelect
                                    link={doubleAdd[index]?.right || ''}
                                    aspectRatio={['4:5', '1:1']}
                                    saveSelectedMedia={(selectedMedia) =>
                                      saveDoubleMedia(selectedMedia, 'right', setFieldValue, index)
                                    }
                                  />
                                </Grid>
                              </>
                            )}
                          </Grid>
                        </Grid>
                      );
                    })}
                </Grid>
              )}
            />

            <Grid container justifyContent='center' style={{ marginTop: '20px' }}>
              <Button type='submit' variant='contained' color='primary'>
                Save
              </Button>
            </Grid>
          </Form>
        )}
      </Formik>
    </Layout>
  );
};
