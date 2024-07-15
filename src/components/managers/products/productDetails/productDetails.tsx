import { AppBar, Button, Grid, Toolbar } from '@mui/material';
import { MakeGenerics, useMatch } from '@tanstack/react-location';
import { getProductByID, upsertProduct } from 'api/admin';
import { UpsertProductRequest, common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { Field, Form, Formik } from 'formik';
import isEqual from 'lodash/isEqual';
import { FC, useEffect, useState } from 'react';
import { BasicProductIformation } from './basicProductInormation/basicProductInformation';
import { MediaView } from './productMedia/mediaView';
import { ProductSizesAndMeasurements } from './productSizesAndMeasurements/productSizesAndMeasurements';
import { ProductTags } from './productTags/productTags';
import { productInitialValues } from './utility/productInitialValues';

export type ProductIdProps = MakeGenerics<{
  Params: {
    id: string;
  };
}>;

export const ProductDetails: FC = () => {
  const {
    params: { id },
  } = useMatch<ProductIdProps>();

  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [initialValues, setInitialValues] = useState<common_ProductNew>(productInitialValues());
  const [isFormChanged, setIsFormChanged] = useState<boolean>(false);

  const fetchProduct = async () => {
    try {
      const response = await getProductByID({ id: parseInt(id) });
      setProduct(response.product);
      setInitialValues(productInitialValues(response.product));
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const handleFormSubmit = async (
    values: common_ProductNew,
    setSubmitting: (isSubmitting: boolean) => void,
  ) => {
    const updatePayload: UpsertProductRequest = {
      id: parseInt(id),
      product: values,
    };

    try {
      await upsertProduct(updatePayload);
      fetchProduct();
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
      toggleEditMode();
    }
  };

  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  return (
    <Layout>
      <Formik
        initialValues={initialValues}
        enableReinitialize={true}
        onSubmit={(values, { setSubmitting }) => handleFormSubmit(values, setSubmitting)}
      >
        {({ values, handleSubmit }) => {
          useEffect(() => {
            setIsFormChanged(!isEqual(values, initialValues));
          }, [values, initialValues]);

          return (
            <Form>
              <AppBar
                position='fixed'
                sx={{ top: 'auto', bottom: 0, backgroundColor: 'transparent', boxShadow: 'none' }}
              >
                <Toolbar sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    size='small'
                    variant='contained'
                    type='button'
                    onClick={() => {
                      if (isEditMode) {
                        handleSubmit();
                      } else {
                        toggleEditMode();
                      }
                    }}
                    disabled={isEditMode && !isFormChanged}
                  >
                    {isEditMode ? 'Save' : 'Edit'}
                  </Button>
                </Toolbar>
              </AppBar>
              <Grid container spacing={2} padding='2%' justifyContent='center'>
                <Grid item xs={12} sm={6}>
                  <Field
                    name='mediaIds'
                    isEditMode={isEditMode}
                    product={product}
                    component={MediaView}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Field
                        name='product.productBody'
                        isEditMode={isEditMode}
                        product={product}
                        component={BasicProductIformation}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Field name='tags' isEditMode={isEditMode} component={ProductTags} />
                    </Grid>
                  </Grid>
                </Grid>
                <Grid item xs={12}>
                  <Field
                    component={ProductSizesAndMeasurements}
                    name='sizeMeasurements'
                    isEditMode={isEditMode}
                  />
                </Grid>
              </Grid>
            </Form>
          );
        }}
      </Formik>
    </Layout>
  );
};
