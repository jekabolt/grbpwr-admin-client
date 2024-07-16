import { AppBar, Button, CircularProgress, Grid, Toolbar } from '@mui/material';
import { getProductByID } from 'api/admin';
import { common_Dictionary, common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
import { Field, Form, Formik } from 'formik';
import isEqual from 'lodash/isEqual';
import { FC, useEffect, useState } from 'react';
import { productInitialValues } from '../productDetails/utility/productInitialValues';
import { BasicProductFields } from './basicProductFields';
import { MediaView } from './mediaView';
import { ProductSizesAndMeasurements } from './productSizesAndMeasurements';
import { ProductTags } from './productTags';

interface GenericProductFormProps {
  initialProductState: common_ProductNew;
  isEditMode?: boolean;
  isAddingProduct?: boolean;
  productId?: string;
  dictionary?: common_Dictionary;
  onSubmit: (
    values: common_ProductNew,
    actions: { setSubmitting: (isSubmitting: boolean) => void; resetForm: () => void },
  ) => Promise<void>;
  onEditModeChange?: (isEditMode: boolean) => void;
}

export const GenericProductForm: FC<GenericProductFormProps> = ({
  initialProductState,
  isEditMode = false,
  isAddingProduct = false,
  productId,
  dictionary,
  onSubmit,
  onEditModeChange,
}) => {
  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const [clearMediaPreview, setClearMediaPreview] = useState(false);
  const [initialValues, setInitialValues] = useState<common_ProductNew>(initialProductState);
  const [isFormChanged, setIsFormChanged] = useState<boolean>(false);

  useEffect(() => {
    if (productId) {
      const fetchProduct = async () => {
        try {
          const response = await getProductByID({ id: parseInt(productId) });
          setProduct(response.product);
          setInitialValues(productInitialValues(response.product));
        } catch (error) {
          console.error(error);
        }
      };
      fetchProduct();
    }
  }, [productId]);

  return (
    <Formik initialValues={initialValues} onSubmit={onSubmit} enableReinitialize={true}>
      {({ values, handleSubmit, isSubmitting }) => {
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
                    } else if (onEditModeChange) {
                      onEditModeChange(true);
                    } else {
                      handleSubmit();
                    }
                  }}
                  disabled={isEditMode && !isFormChanged}
                >
                  {isSubmitting ? (
                    <CircularProgress size={24} />
                  ) : isAddingProduct || isEditMode ? (
                    'save'
                  ) : (
                    'edit'
                  )}
                </Button>
              </Toolbar>
            </AppBar>
            <Grid container justifyContent='center' padding='2%' spacing={2}>
              <Grid item xs={12} sm={6}>
                <Field
                  component={MediaView}
                  name='mediaIds'
                  isEditMode={isEditMode}
                  isAddingProduct={isAddingProduct}
                  product={product}
                  clearMediaPreview={clearMediaPreview}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Field
                      component={BasicProductFields}
                      name='product.productBody'
                      dictionary={dictionary}
                      isEditMode={isEditMode}
                      isAddingProduct={isAddingProduct}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Field
                      component={ProductTags}
                      name='tags'
                      isEditMode={isEditMode}
                      isAddingProduct={isAddingProduct}
                      initialTags={
                        product
                          ? product.tags?.map((tag) => tag.productTagInsert?.tag || '') || []
                          : undefined
                      }
                    />
                  </Grid>
                </Grid>
              </Grid>
              <Grid item xs={12}>
                <Field
                  component={ProductSizesAndMeasurements}
                  name='sizeMeasurements'
                  dictionary={dictionary}
                  isEditMode={isEditMode}
                  isAddingProduct={isAddingProduct}
                />
              </Grid>
            </Grid>
          </Form>
        );
      }}
    </Formik>
  );
};
