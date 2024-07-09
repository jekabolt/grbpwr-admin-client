import { Alert, AppBar, Button, Grid, Snackbar, Toolbar } from '@mui/material';
import { MakeGenerics, useMatch } from '@tanstack/react-location';
import { getProductByID, upsertProduct } from 'api/admin';
import { UpsertProductRequest, common_GenderEnum, common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { Field, Form, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';
import { BasicProductIformation } from './basicProductInormation/basicProductInformation';
import { MediaView } from './productMedia/mediaView';
import { ProductSizesAndMeasurements } from './productSizesAndMeasurements/productSizesAndMeasurements';
import { ProductTags } from './productTags/productTags';

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
  const [thumbnailId, setThumbnailId] = useState<number | undefined>();
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const [isEdit, setIsEdit] = useState<boolean>(false);

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(!isSnackBarOpen);
  };

  const fetchProduct = async () => {
    try {
      const response = await getProductByID({
        id: parseInt(id),
      });
      setProduct(response.product);
    } catch (error) {
      console.error(error);
    }
  };

  const updateProduct = async (updatePayload: UpsertProductRequest) => {
    try {
      if (
        updatePayload.product?.product?.productBody?.preorder !== '' &&
        updatePayload.product?.product?.productBody?.salePercentage?.value
      ) {
        updatePayload.product.product.productBody.salePercentage.value = '0';
      }
      await upsertProduct(updatePayload);
      showMessage('PRODUCT HAS BEEN UPLOADED', 'success');
      fetchProduct();
    } catch (error) {
      const message = sessionStorage.getItem('errorcode');
      message ? showMessage(message, 'error') : showMessage('PRODUCT CANNOT BE UPDATED', 'error');
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const handleFormSubmit = (
    values: UpsertProductRequest,
    setSubmitting: (isSubmitting: boolean) => void,
  ) => {
    const updatePayload: UpsertProductRequest = {
      id: parseInt(id),
      product: {
        product: values.product?.product,
        sizeMeasurements: values.product?.sizeMeasurements,
        tags: values.product?.tags,
        mediaIds: values.product?.mediaIds,
      },
    };
    updateProduct(updatePayload);
    setSubmitting(false);
    enableEditMode();
  };

  const enableEditMode = () => {
    setIsEdit(!isEdit);
  };

  return (
    <Layout>
      <Formik
        initialValues={{
          id: product?.product?.id,
          product: {
            product: {
              productBody: {
                preorder: '',
                name: product?.product?.productDisplay?.productBody?.name ?? '',
                brand: '',
                sku: '',
                color: '',
                colorHex: '',
                countryOfOrigin: '',
                price: { value: '0' },
                salePercentage: { value: '0' },
                categoryId: 0,
                description: '',
                hidden: false,
                targetGender: '' as common_GenderEnum,
              },
              thumbnailMediaId: product?.product?.productDisplay?.thumbnail?.id,
            },
            sizeMeasurements: [],
            tags: [],
            mediaIds: [],
          },
        }}
        enableReinitialize={true}
        onSubmit={(values, { setSubmitting }) => handleFormSubmit(values, setSubmitting)}
      >
        {({ values, handleSubmit }) => (
          <Form onSubmit={handleSubmit}>
            <AppBar
              position='fixed'
              sx={{ top: 'auto', bottom: 0, backgroundColor: 'transparent', boxShadow: 'none' }}
            >
              <Toolbar sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  size='small'
                  variant='contained'
                  onClick={() => setIsEdit(!isEdit)}
                  type='submit'
                >
                  save
                </Button>
              </Toolbar>
            </AppBar>
            <Grid container spacing={2} padding='2%' justifyContent='center'>
              <Grid item xs={12} sm={6}>
                <Field
                  name='mediaIds'
                  component={MediaView}
                  product={product}
                  id={id}
                  fetchProduct={fetchProduct}
                  showMessage={showMessage}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Field
                      component={BasicProductIformation}
                      name='product.product.productBody'
                      product={product}
                      isEdit={isEdit}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <ProductTags
                      product={product}
                      id={id}
                      fetchProduct={fetchProduct}
                      showMessage={showMessage}
                    />
                  </Grid>
                </Grid>
              </Grid>
              <Grid item xs={12}>
                <ProductSizesAndMeasurements
                  product={product}
                  fetchProduct={fetchProduct}
                  id={id}
                  showMessage={showMessage}
                />
              </Grid>
            </Grid>
            <Snackbar
              open={isSnackBarOpen}
              autoHideDuration={6000}
              onClose={() => setIsSnackBarOpen(!isSnackBarOpen)}
            >
              <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
            </Snackbar>
          </Form>
        )}
      </Formik>
    </Layout>
  );
};
