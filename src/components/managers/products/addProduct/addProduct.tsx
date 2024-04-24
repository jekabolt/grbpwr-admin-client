import { Alert, Button, Grid, Snackbar } from '@mui/material';
import CircularProgress from '@mui/material/CircularProgress';
import { addProduct, getDictionary } from 'api/admin';
import { AddProductRequest, common_Dictionary, common_ProductNew } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { Field, Form, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';
import { CommonProductInsert } from './commonProductInsert/commonProductInsert';
import { Media } from './media/media';
import { Sizes } from './sizes/sizes';
import { Tags } from './tag/tag';

export const initialProductState: common_ProductNew = {
  media: [],
  product: {
    preorder: '',
    name: '',
    brand: '',
    sku: '',
    color: '',
    colorHex: '',
    countryOfOrigin: '',
    thumbnail: '',
    price: { value: '0' },
    salePercentage: { value: '0' },
    categoryId: 0,
    description: '',
    hidden: false,
    targetGender: 'GENDER_ENUM_UNKNOWN',
  },
  sizeMeasurements: [],
  tags: [],
};

export const AddProducts: FC = () => {
  const [dictionary, setDictionary] = useState<common_Dictionary | undefined>();
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(!isSnackBarOpen);
  };

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setDictionary(response.dictionary);
    };
    fetchDictionary();
  }, []);

  const handleSubmit = async (
    values: common_ProductNew,
    {
      setSubmitting,
      resetForm,
    }: { setSubmitting: (isSubmitting: boolean) => void; resetForm: () => void },
  ) => {
    try {
      const nonEmptySizeMeasurements = values.sizeMeasurements?.filter(
        (sizeMeasurement) =>
          sizeMeasurement &&
          sizeMeasurement.productSize &&
          sizeMeasurement.productSize.quantity !== null,
      );

      const productToSubmit: AddProductRequest = {
        product: {
          ...values,
          sizeMeasurements: nonEmptySizeMeasurements,
        },
      };

      await addProduct(productToSubmit);
      showMessage('PRODUCT UPLOADED', 'success');
      resetForm();
    } catch (error) {
      const message = sessionStorage.getItem('errorCode');
      message ? showMessage(message, 'error') : '';
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <Formik initialValues={initialProductState} onSubmit={handleSubmit}>
        {({ isSubmitting }) => (
          <Form>
            <Grid
              container
              justifyContent='center'
              style={{ width: '90%', margin: '3%' }}
              spacing={2}
            >
              <Grid item xs={7}>
                <Field component={Media} name='media' />
              </Grid>
              <Grid item xs={4}>
                <Grid container spacing={2}>
                  <Grid item>
                    <Field component={CommonProductInsert} name='product' dictionary={dictionary} />
                  </Grid>
                  <Grid item>
                    <Field component={Tags} name='tags' />
                  </Grid>
                </Grid>
              </Grid>
              <Grid item xs={11}>
                <Field component={Sizes} name='sizeMeasurements' dictionary={dictionary} />
              </Grid>
              <Grid item>
                <Button type='submit' variant='contained' size='large'>
                  {isSubmitting ? <CircularProgress size={24} /> : 'submit'}
                </Button>
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
      <Snackbar
        open={isSnackBarOpen}
        autoHideDuration={6000}
        onClose={() => setIsSnackBarOpen(!isSnackBarOpen)}
      >
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Layout>
  );
};
