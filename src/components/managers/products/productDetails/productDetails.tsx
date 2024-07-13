import { AppBar, Button, Grid, Toolbar } from '@mui/material';
import { MakeGenerics, useMatch } from '@tanstack/react-location';
import { getProductByID, upsertProduct } from 'api/admin';
import { UpsertProductRequest, common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
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

  const fetchProduct = async () => {
    try {
      const response = await getProductByID({ id: parseInt(id) });
      setProduct(response.product);
    } catch (error) {
      console.error(error);
    }
  };

  const updateProduct = async (updatePayload: UpsertProductRequest) => {
    try {
      await upsertProduct(updatePayload);

      fetchProduct();
    } catch (error) {}
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const handleFormSubmit = (
    values: common_ProductNew,
    setSubmitting: (isSubmitting: boolean) => void,
  ) => {
    const updatePayload: UpsertProductRequest = {
      id: parseInt(id),
      product: values,
    };

    updateProduct(updatePayload);
    setSubmitting(false);
  };

  const getInitialValues = (product?: common_ProductFull): common_ProductNew => {
    if (!product) {
      return {} as common_ProductNew;
    }

    return {
      product: {
        productBody: product.product?.productDisplay?.productBody,
        thumbnailMediaId: product.product?.productDisplay?.thumbnail?.id || 0,
      },
      sizeMeasurements: product.sizes?.map((size) => ({
        productSize: {
          quantity: { value: size.quantity?.value } || { value: '0' },
          sizeId: size.sizeId,
        },
        measurements: product.measurements
          ?.filter((measurement) => measurement.productSizeId === size.sizeId)
          .map((m) => ({
            measurementNameId: m.measurementNameId,
            measurementValue: { value: m.measurementValue?.value } || { value: '0' },
          })),
      })),
      tags:
        product.tags?.map((tag) => ({
          tag: tag.productTagInsert?.tag || '',
        })) || [],
      mediaIds:
        product.media?.map((media) => media.id).filter((id): id is number => id !== undefined) ||
        [],
    };
  };

  return (
    <Layout>
      <Formik
        initialValues={getInitialValues(product)}
        enableReinitialize={true}
        onSubmit={(values, { setSubmitting }) => handleFormSubmit(values, setSubmitting)}
      >
        {({ handleSubmit }) => (
          <Form onSubmit={handleSubmit}>
            <AppBar
              position='fixed'
              sx={{ top: 'auto', bottom: 0, backgroundColor: 'transparent', boxShadow: 'none' }}
            >
              <Toolbar sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button size='small' variant='contained' type='submit'>
                  save
                </Button>
              </Toolbar>
            </AppBar>
            <Grid container spacing={2} padding='2%' justifyContent='center'>
              <Grid item xs={12} sm={6}>
                <Field name='mediaIds' component={MediaView} product={product} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Field
                      component={BasicProductIformation}
                      name='product.productBody'
                      product={product}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Field component={ProductTags} product={product} name='tags' />
                  </Grid>
                </Grid>
              </Grid>
              <Grid item xs={12}>
                <Field
                  component={ProductSizesAndMeasurements}
                  name='sizeMeasurements'
                  product={product}
                />
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
    </Layout>
  );
};
