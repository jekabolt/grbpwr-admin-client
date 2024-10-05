import { Button, Grid, TextField } from '@mui/material';
import { addHero, getHero } from 'api/hero';
import { common_HeroFullInsert, common_MediaFull, common_Product } from 'api/proto-http/admin';
import { common_HeroFull } from 'api/proto-http/frontend';
import { ProductPickerModal } from 'components/common/productPickerModal';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { Layout } from 'components/login/layout';
import { Field, FieldArray, Form, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';
import { HeroProductTable } from './heroProductsTable';
import { mapHeroFunction } from './mapHeroFunction';
import { SelectHeroType } from './selectHeroType';

export const Hero: FC = () => {
  const [heroData, setHeroData] = useState<common_HeroFull | undefined>(undefined);
  const [hero, setHero] = useState<common_HeroFullInsert>(mapHeroFunction());
  const [single, setSingle] = useState<string>('');
  const [main, setMain] = useState<string>('');
  const [product, setProduct] = useState<common_Product[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleOpenProductSelection = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const fetchDictionary = async () => {
    const response = await getHero({});
    if (response) {
      const singleAdd = response.hero?.entities?.find((entity) => entity.singleAdd);
      const mainAdd = response.hero?.entities?.find((entity) => entity.mainAdd);
      const heroProduct = response.hero?.entities?.find(
        (entity) => entity.featuredProducts?.products,
      );
      setHeroData(response.hero);
      setHero(mapHeroFunction(response.hero));
      setSingle(singleAdd?.singleAdd?.media?.media?.thumbnail?.mediaUrl || '');
      setMain(mainAdd?.mainAdd?.singleAdd?.media?.media?.thumbnail?.mediaUrl || '');
      if (heroProduct?.featuredProducts?.products) {
        setProduct(heroProduct?.featuredProducts?.products);
      }
    }
  };

  useEffect(() => {
    fetchDictionary();
  }, []);

  const saveHero = async (values: common_HeroFullInsert) => {
    await addHero({ hero: values });
  };

  const handleProductsReorder = (newProductsOrder: common_Product[]) => {
    setProduct(newProductsOrder);
  };

  const saveSingleMedia = (
    selectedMedia: common_MediaFull[],
    setFieldValue: any,
    index: number,
  ) => {
    const newSingleMedia = selectedMedia[0];
    setFieldValue(`entities.${index}.singleAdd.mediaId`, newSingleMedia.id);
    setSingle(newSingleMedia.media?.thumbnail?.mediaUrl || '');
  };

  const saveMainMedia = (selectedMedia: common_MediaFull[], setFieldValue: any, index: number) => {
    const newMainMedia = selectedMedia[0];
    setFieldValue(`entities.${index}.mainAdd.singleAdd.mediaId`, newMainMedia.id);
    setMain(newMainMedia.media?.thumbnail?.mediaUrl || '');
  };

  const clearMediaState = (entityType: string) => {
    if (entityType === 'HERO_TYPE_MAIN_ADD') {
      setMain('');
    }
    if (entityType === 'HERO_TYPE_SINGLE_ADD') {
      setSingle('');
    }
  };

  return (
    <Layout>
      <Formik initialValues={hero} enableReinitialize onSubmit={saveHero}>
        {({ values, handleSubmit, setFieldValue }) => (
          <Form onSubmit={handleSubmit}>
            <FieldArray
              name='entities'
              render={(arrayHelpers) => (
                <>
                  <Grid item>
                    <Field component={SelectHeroType} arrayHelpers={arrayHelpers} />
                  </Grid>
                  {values.entities &&
                    values.entities.map((entity, index) => {
                      const handleSaveNewSelection = (newSelectedProducts: common_Product[]) => {
                        setProduct(newSelectedProducts);
                        const productIds = newSelectedProducts.map((product) => product.id);
                        setFieldValue(`entities.${index}.featuredProducts.productIds`, productIds);
                      };
                      return (
                        <Grid container gap={2} justifyContent='center' key={index}>
                          {entity.type === 'HERO_TYPE_MAIN_ADD' && (
                            <Grid item xs={10}>
                              <SingleMediaViewAndSelect
                                link={main}
                                aspectRatio={['4:5', '5:4', '1:1', '16:9', '9:16']}
                                saveSelectedMedia={(selectedMedia) =>
                                  saveMainMedia(selectedMedia, setFieldValue, index)
                                }
                              />
                              <Field
                                name={`entities.${index}.mainAdd.singleAdd.exploreLink`}
                                as={TextField}
                                label='Explore Link'
                                fullWidth
                              />
                              <Field
                                name={`entities.${index}.mainAdd.singleAdd.exploreText`}
                                as={TextField}
                                label='Explore Text'
                                fullWidth
                              />
                            </Grid>
                          )}
                          {entity.type === 'HERO_TYPE_SINGLE_ADD' && (
                            <Grid item xs={10}>
                              <SingleMediaViewAndSelect
                                link={single}
                                aspectRatio={['4:5', '5:4', '1:1', '16:9', '9:16']}
                                saveSelectedMedia={(selectedMedia) =>
                                  saveSingleMedia(selectedMedia, setFieldValue, index)
                                }
                              />
                              <Field
                                name={`entities.${index}.singleAdd.exploreLink`}
                                as={TextField}
                                label='Explore Link'
                                fullWidth
                              />
                              <Field
                                name={`entities.${index}.singleAdd.exploreText`}
                                as={TextField}
                                label='Explore Text'
                                fullWidth
                              />
                            </Grid>
                          )}
                          {entity.type === 'HERO_TYPE_FEATURED_PRODUCTS' && (
                            <>
                              <Field
                                name={`entities.${index}.featuredProducts.title`}
                                as={TextField}
                                label='Title'
                                fullWidth
                              />
                              <Field
                                name={`entities.${index}.featuredProducts.exploreLink`}
                                as={TextField}
                                label='Explore Link'
                                fullWidth
                              />
                              <Field
                                name={`entities.${index}.featuredProducts.exploreText`}
                                as={TextField}
                                label='Explore Text'
                                fullWidth
                              />
                              <HeroProductTable
                                products={product}
                                id={index}
                                onReorder={handleProductsReorder}
                                setFieldValue={setFieldValue}
                              />
                              <Button
                                size='small'
                                variant='contained'
                                onClick={handleOpenProductSelection}
                              >
                                Add Products
                              </Button>
                              <Grid item xs={12}>
                                <ProductPickerModal
                                  open={isModalOpen}
                                  onClose={handleCloseModal}
                                  onSave={handleSaveNewSelection}
                                  selectedProductIds={product.map((x) => x.id!)}
                                />
                              </Grid>
                            </>
                          )}
                          <Button
                            onClick={() => {
                              clearMediaState(values.entities?.[index].type || '');
                              arrayHelpers.remove(index);
                            }}
                          >
                            Remove Entity
                          </Button>
                        </Grid>
                      );
                    })}
                </>
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
